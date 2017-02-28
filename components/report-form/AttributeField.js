// @flow

import React from 'react';
import { css } from 'glamor';
import type { ServiceMetadataAttribute } from '../../data/types';

export type Props = {
  attribute: ServiceMetadataAttribute,
  attributeChanged: (code: string, value: string | string[]) => void,
  currentValue: ?string | ?string[],
};

const TEXT_TEXTAREA_STYLE = css({
  width: '100%',
  height: 180,
});

const TEXT_INPUT_STYLE = css({
  width: '100%',
  padding: 10,
  fontSize: 18,
});

const NUMBER_INPUT_STYLE = css({
  padding: 10,
  fontSize: 18,
  textAlign: 'right',
});

const DATETIME_INPUT_STYLE = css({
  padding: 10,
  fontSize: 18,
});

function currentValueAsArray(currentValue) {
  if (!currentValue) {
    return [];
  } else if (Array.isArray(currentValue)) {
    return currentValue;
  } else {
    return [currentValue];
  }
}

function renderCheckbox(attribute, onChange, currentValue) {
  return (
    <label className="cb">
      <input name={attribute.code} type="checkbox" value="true" className="cb-f" checked={currentValue === 'true'} onChange={onChange} />
      <span className="cb-l">{attribute.description}</span>
    </label>
  );
}

function renderMultiValueListAttribute(attribute, onChange, currentValue) {
  const values = currentValueAsArray(currentValue);

  return (
    <div>
      { attribute.description }
      { (attribute.values || []).map(({ key, name }) => (
        <label className="cb" key={key}>
          <input name={attribute.code} type="checkbox" value={key} className="cb-f" checked={values.indexOf(key) !== -1} onChange={onChange} />
          <span className="cb-l">{name}</span>
        </label>
      ))
    }
    </div>
  );
}

function renderDatetimeAttribute(attribute, onInput, currentValue) {
  return (
    <label key={attribute.code}>
      <p>{attribute.description} {attribute.required ? '(required)' : null}</p>
      <input type="date" name={attribute.code} className={DATETIME_INPUT_STYLE} value={currentValue} onInput={onInput} />
    </label>
  );
}

function renderInformationalAttribute(attribute) {
  return (
    <p key={attribute.code}>{attribute.description}</p>
  );
}

function renderTextAttribute(attribute, onInput, currentValue) {
  return (
    <label key={attribute.code}>
      <p>{attribute.description} {attribute.required ? '(required)' : null}</p>
      <textarea name={attribute.code} className={TEXT_TEXTAREA_STYLE} value={currentValue} onInput={onInput} />
    </label>
  );
}

function renderStringAttribute(attribute, onInput, currentValue) {
  return (
    <label key={attribute.code}>
      <p>{attribute.description} {attribute.required ? '(required)' : null}</p>
      <input type="text" name={attribute.code} className={TEXT_INPUT_STYLE} value={currentValue} onInput={onInput} />
    </label>
  );
}

function renderNumberAttribute(attribute, onInput, currentValue) {
  return (
    <label key={attribute.code}>
      <p>{attribute.description} {attribute.required ? '(required)' : null}</p>
      <input type="number" name={attribute.code} className={NUMBER_INPUT_STYLE} value={currentValue} onInput={onInput} />
    </label>
  );
}


function renderSingleValueListAttribute(attribute, onInput, currentValue) {
  return (
    <label key={attribute.code}>
      <p>{attribute.description}</p>
      <select name={attribute.code} onInput={onInput} value={currentValue}>
        {(attribute.values || []).map(({ key, name }) => <option value={key} key={key}>{name}</option>)}
      </select>
    </label>
  );
}

export default function AttributeField({ attribute, attributeChanged, currentValue }: Props) {
  const onInput = (ev: SyntheticInputEvent) => {
    attributeChanged(attribute.code, ev.target.value);
  };

  const onCheckbox = (ev: SyntheticInputEvent) => {
    attributeChanged(attribute.code, (ev.target.checked || false).toString());
  };

  const onMultivalueList = (ev: SyntheticInputEvent) => {
    const values = currentValueAsArray(currentValue);

    if (ev.target.checked) {
      attributeChanged(attribute.code, [...values, ev.target.value]);
    } else {
      attributeChanged(attribute.code, values.filter((v) => v !== ev.target.value));
    }
  };

  switch (attribute.type) {
    case 'BOOLEAN_CHECKBOX':
      return renderCheckbox(attribute, onCheckbox, currentValue);
    case 'INFORMATIONAL':
      return renderInformationalAttribute(attribute);
    case 'DATETIME':
      return renderDatetimeAttribute(attribute, onInput, currentValue);
    case 'STRING':
      return renderStringAttribute(attribute, onInput, currentValue);
    case 'NUMBER':
      return renderNumberAttribute(attribute, onInput, currentValue);
    case 'TEXT':
      return renderTextAttribute(attribute, onInput, currentValue);
    case 'SINGLEVALUELIST':
      return renderSingleValueListAttribute(attribute, onInput, currentValue);
    case 'MULTIVALUELIST':
      return renderMultiValueListAttribute(attribute, onMultivalueList, currentValue);
    default:
      return null;
  }
}
