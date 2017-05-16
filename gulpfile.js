// @flow
/* eslint no-console: 0 */

const fs = require('fs');
const gulp = require('gulp');
const ignore = require('gulp-ignore');
const babel = require('gulp-babel');
const svgSprite = require('gulp-svg-sprite');

const del = require('del');
const plumber = require('gulp-plumber');
const exec = require('child_process').exec;

const IGNORED_JS_SOURCE = ['**/__mocks__', '**/*.test.js'];

const spriteDirContents = fs.readdirSync('sprites');
const SPRITE_TASKS = [];
const SPRITE_WATCH_TASKS = [];

spriteDirContents.forEach((path) => {
  if (path.startsWith('.')) {
    return;
  }

  const taskName = `sprite:${path}`;
  SPRITE_TASKS.push(taskName);
  SPRITE_WATCH_TASKS.push(`watch:${taskName}`);

  gulp.task(taskName, () => (
    gulp.src(`sprites/${path}/*.svg`)
      .pipe(plumber())
      .pipe(svgSprite({
        mode: {
          symbol: {
            sprite: `${path}.svg`,
            dest: '',
          },
        },
      }))
      .pipe(gulp.dest('static/img/svg'))
  ));

  gulp.task(`watch:${taskName}`, () => (
    gulp.watch(`sprites/${path}/*.svg`, [taskName])
  ));
});

gulp.task('sprite', SPRITE_TASKS);
gulp.task('watch:sprite', SPRITE_WATCH_TASKS);

gulp.task('clean:build', () => (
  del('build')
));

gulp.task('clean:next', () => (
  del('.next')
));

gulp.task('babel:server', ['clean:build'], () => (
  gulp.src('server/**/*.js')
    .pipe(plumber())
    .pipe(ignore.exclude(IGNORED_JS_SOURCE))
    .pipe(babel())
    .pipe(gulp.dest('build/server'))
));

gulp.task('next:compile', ['clean:next'], (cb) => {
  exec('next build', (err, stdout, stderr) => {
    if (stdout) console.log(stdout);
    if (stderr) console.log(stderr);
    cb(err);
  });
});

gulp.task('templates:fetch', (cb) => {
  exec('babel-node ./scripts/fetch-templates', (err, stdout, stderr) => {
    if (stdout) console.log(stdout);
    if (stderr) console.log(stderr);
    cb(err);
  });
});

const GRAPHQL_QUERIES = 'data/dao/graphql/*.graphql';
const GRAPHQL_SCHEMA = 'graphql/schema.json';

gulp.task('graphql:schema', (cb) => {
  exec('babel-node ./scripts/generate-schema', (err, stdout, stderr) => {
    if (stdout) console.log(stdout);
    if (stderr) console.log(stderr);
    cb(err);
  });
});

gulp.task('graphql:types', ['graphql:schema'], (cb) => {
  exec(`apollo-codegen generate ${GRAPHQL_QUERIES} --schema ${GRAPHQL_SCHEMA} --target flow --output data/dao/graphql/types.js`, (err, stdout, stderr) => {
    if (stdout) console.log(stdout);
    if (stderr) console.log(stderr);
    cb(err);
  });
});

gulp.task('watch:graphql', () => [
  gulp.watch('server/graphql/*.js', ['graphql:schema']),
  gulp.watch([GRAPHQL_QUERIES, GRAPHQL_SCHEMA], ['graphql:types']),
]);

// TODO(finh): restore pulling templates at this step
gulp.task('build', ['babel:server', 'next:compile']);
gulp.task('watch', ['watch:graphql', 'watch:sprite']);