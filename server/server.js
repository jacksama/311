// @flow
/* eslint no-console: 0 */
import Hapi from 'hapi';
import Good from 'good';
import Inert from 'inert';
import next from 'next';
import Boom from 'boom';
import fs from 'fs';
import Path from 'path';
import { graphqlHapi, graphiqlHapi } from 'apollo-server-hapi';
import acceptLanguagePlugin from 'hapi-accept-language';

import decryptEnv from './lib/decrypt-env';
import reportDeployToOpbeat from './lib/report-deploy-to-opbeat';
import { nextHandler, nextDefaultHandler } from './next-handlers';
import { opbeatWrapGraphqlOptions } from './opbeat-graphql';
import Open311 from './services/Open311';
import ArcGIS from './services/ArcGIS';
import Prediction from './services/Prediction';
import Elasticsearch from './services/Elasticsearch';
import Salesforce from './services/Salesforce';

import schema from './graphql';
import type { Context } from './graphql';
import sitemapHandler from './sitemap';
import legacyServiceRedirectHandler from './legacy-service-redirect';

const port = parseInt(process.env.PORT || '3000', 10);

export default async function startServer({ opbeat }: any) {
  reportDeployToOpbeat(opbeat);
  await decryptEnv();

  const server = new Hapi.Server();
  const app = next({
    dev: process.env.NODE_ENV !== 'production',
  });

  const nextAppPreparation = app.prepare();

  if (
    process.env.ELASTICSEARCH_URL &&
    process.env.ELASTICSEARCH_URL.endsWith('.amazonaws.com')
  ) {
    Elasticsearch.configureAws(process.env.AWS_REGION);
  }

  const elasticsearch = new Elasticsearch(
    process.env.ELASTICSEARCH_URL,
    process.env.ELASTICSEARCH_INDEX,
    opbeat
  );

  const salesforce = process.env.SALESFORCE_OAUTH_URL
    ? new Salesforce(
        process.env.SALESFORCE_OAUTH_URL,
        process.env.SALESFORCE_CONSUMER_KEY,
        process.env.SALESFORCE_CONSUMER_SECRET,
        process.env.SALESFORCE_API_USERNAME,
        process.env.SALESFORCE_API_PASSWORD,
        process.env.SALESFORCE_API_SECURITY_TOKEN,
        opbeat
      )
    : null;

  if (salesforce) {
    // We block startup on making sure we can authenticate to Salesforce.
    await salesforce.reauthorize();
    console.log('Successfully authenticated to Salesforce');
  }

  if (process.env.USE_SSL) {
    const tls = {
      key: fs.readFileSync('server.key'),
      cert: fs.readFileSync('server.crt'),
    };

    server.connection({ port, tls }, '0.0.0.0');
  } else {
    server.connection({ port }, '0.0.0.0');
  }

  server.auth.scheme(
    'headerKeys',
    (s, { keys, header }: { header: string, keys: string[] }) => ({
      authenticate: (request, reply) => {
        const key = request.headers[header.toLowerCase()];
        if (!key) {
          reply(Boom.unauthorized(`Missing ${header} header`));
        } else if (keys.indexOf(key) === -1) {
          reply(Boom.unauthorized(`Key ${key} is not a valid key`));
        } else {
          reply.continue({ credentials: key });
        }
      },
    })
  );

  server.auth.strategy('apiKey', 'headerKeys', {
    header: 'X-API-KEY',
    keys: process.env.API_KEYS ? process.env.API_KEYS.split(',') : [],
  });

  server.register({
    register: Good,
    options: {
      reporters: {
        console: [
          {
            module: 'good-squeeze',
            name: 'Squeeze',
            args: [
              {
                // Keep our health checks from appearing in logs
                response: { exclude: 'health' },
                log: '*',
              },
            ],
          },
          {
            module: 'good-console',
            args: [
              {
                color: process.env.NODE_ENV !== 'production',
              },
            ],
          },
          'stdout',
        ],
      },
    },
  });

  server.register(Inert);
  server.register(acceptLanguagePlugin);

  server.register({
    register: graphqlHapi,
    options: {
      path: '/graphql',
      // We use a function here so that all of our services are request-scoped
      // and can cache within the same query but not leak to others.
      graphqlOptions: opbeatWrapGraphqlOptions(opbeat, () => ({
        schema,
        context: ({
          open311: new Open311(
            process.env.PROD_311_ENDPOINT,
            process.env.PROD_311_KEY,
            salesforce,
            opbeat
          ),
          arcgis: new ArcGIS(process.env.ARCGIS_ENDPOINT, opbeat),
          prediction: new Prediction(process.env.PREDICTION_ENDPOINT, opbeat),
          // Elasticsearch maintains a persistent connection, so we re-use it
          // across requests.
          elasticsearch,
          opbeat,
        }: Context),
      })),
      route: {
        cors: true,
        auth: 'apiKey',
      },
    },
  });

  server.register({
    register: graphiqlHapi,
    options: {
      path: '/graphiql',
      graphiqlOptions: {
        endpointURL: '/graphql',
        passHeader: `'X-API-KEY': '${process.env.WEB_API_KEY || ''}'`,
      },
    },
  });

  server.route({
    method: 'GET',
    path: '/',
    handler: nextHandler(app, '/request'),
  });

  server.route({
    method: 'GET',
    path: '/request',
    handler: (request, reply) => reply.redirect('/'),
  });

  server.route({
    method: 'GET',
    path: '/request/{code}',
    handler: nextHandler(app, '/request'),
  });

  server.route({
    method: 'GET',
    path: '/request/{code}/{stage}',
    handler: (request, reply) =>
      reply.redirect(`/request/${request.params.code}`),
  });

  server.route({
    method: 'GET',
    path: '/translate',
    handler: nextHandler(app, '/request', { translate: '1' }),
  });

  server.route({
    method: 'GET',
    path: '/services',
    handler: nextHandler(app, '/services'),
  });

  server.route({
    method: 'GET',
    path: '/search',
    handler: nextHandler(app, '/search'),
  });

  // Old Connected Bits URLs
  server.route({
    method: 'GET',
    path: '/reports/list_services',
    handler: (request, reply) => reply.redirect('/services').permanent(),
  });

  server.route({
    method: 'GET',
    path: '/reports/new',
    handler: legacyServiceRedirectHandler,
  });

  server.route({
    method: 'GET',
    // This domain is chosen to match the existing 311.boston.gov URLs
    path: '/reports/{id}',
    handler: nextHandler(app, '/reports'),
  });

  server.route({
    method: 'GET',
    path: '/faq',
    handler: nextHandler(app, '/faq'),
  });

  // 404 page
  server.route({
    method: '*',
    path: '/{p*}',
    handler: (h => (...args) => {
      const { raw: { res } } = args[0];

      res.statusCode = 404;

      return h(...args);
    })(nextHandler(app, '/_error')),
  });

  server.route({
    method: 'GET',
    path: '/sitemap.xml',
    handler: sitemapHandler(
      new Open311(
        process.env.PROD_311_ENDPOINT,
        process.env.PROD_311_KEY,
        opbeat
      )
    ),
  });

  server.route({
    method: 'GET',
    path: '/_next/{p*}',
    handler: nextDefaultHandler(app),
  });

  server.route({
    method: 'GET',
    path: '/favicon.ico',
    handler: (request, reply) => reply.file('static/favicon.ico'),
  });

  server.route({
    method: 'GET',
    path: '/robots.txt',
    handler: (request, reply) =>
      reply.file(
        process.env.HEROKU_PIPELINE === 'staging'
          ? 'static/robots-staging.txt'
          : 'static/robots-production.txt'
      ),
  });

  server.route({
    method: 'GET',
    path: '/assets/{path*}',
    handler: (request, reply) => {
      if (!request.params.path || request.params.path.indexOf('..') !== -1) {
        return reply(Boom.forbidden());
      }

      const p = Path.join(
        'static',
        'assets',
        ...request.params.path.split('/')
      );
      return reply
        .file(p)
        .header('Cache-Control', 'public, max-age=3600, s-maxage=600');
    },
  });

  server.route({
    method: 'GET',
    path: '/admin/ok',
    handler: (request, reply) => reply('ok'),
    config: {
      // mark this as a health check so that it doesn’t get logged
      tags: ['health'],
    },
  });

  await nextAppPreparation;

  await server.start();
  console.log(`> Ready on http://localhost:${port}`);
}
