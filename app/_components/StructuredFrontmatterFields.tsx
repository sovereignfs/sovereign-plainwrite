'use client';

import { Checkbox, FormField, Input, TagInput } from '@sovereignfs/ui';
import type { CollectionSchemaField } from '../_lib/schema-rules';

interface StructuredFrontmatterFieldsProps {
  fields: CollectionSchemaField[];
  data: Record<string, unknown>;
  onFieldChange: (name: string, value: unknown) => void;
  disabled: boolean;
}

/**
 * Renders one form control per collection schema field, typed to match
 * CollectionSchemaField['type']. Fields not covered by the schema stay in
 * `data` untouched — this component only ever reads/writes the keys it
 * knows about, so unrecognized frontmatter round-trips unchanged.
 */
export function StructuredFrontmatterFields({
  fields,
  data,
  onFieldChange,
  disabled,
}: StructuredFrontmatterFieldsProps) {
  return (
    <>
      {fields.map((field) => (
        <FieldControl
          key={field.name}
          field={field}
          value={data[field.name]}
          onChange={(value) => onFieldChange(field.name, value)}
          disabled={disabled}
        />
      ))}
    </>
  );
}

function FieldControl({
  field,
  value,
  onChange,
  disabled,
}: {
  field: CollectionSchemaField;
  value: unknown;
  onChange: (value: unknown) => void;
  disabled: boolean;
}) {
  if (field.type === 'boolean') {
    return (
      <Checkbox label={field.name} checked={Boolean(value)} onChange={onChange} disabled={disabled} />
    );
  }

  if (field.type === 'array') {
    const tags = Array.isArray(value) ? value.map(String) : [];
    return (
      <FormField label={field.name} required={field.required}>
        {(fieldProps) => (
          <TagInput {...fieldProps} value={tags} onChange={onChange} disabled={disabled} />
        )}
      </FormField>
    );
  }

  if (field.type === 'date') {
    return (
      <FormField label={field.name} required={field.required}>
        {(fieldProps) => (
          <Input
            {...fieldProps}
            type="date"
            value={toDateInputValue(value)}
            onChange={(event) => onChange(event.currentTarget.value || undefined)}
            disabled={disabled}
          />
        )}
      </FormField>
    );
  }

  if (field.type === 'number') {
    return (
      <FormField label={field.name} required={field.required}>
        {(fieldProps) => (
          <Input
            {...fieldProps}
            type="number"
            value={typeof value === 'number' ? String(value) : ''}
            onChange={(event) => {
              const raw = event.currentTarget.value;
              onChange(raw === '' ? undefined : Number(raw));
            }}
            disabled={disabled}
          />
        )}
      </FormField>
    );
  }

  return (
    <FormField label={field.name} required={field.required}>
      {(fieldProps) => (
        <Input
          {...fieldProps}
          type="text"
          value={typeof value === 'string' ? value : (value ?? '') === '' ? '' : String(value)}
          onChange={(event) => onChange(event.currentTarget.value)}
          disabled={disabled}
        />
      )}
    </FormField>
  );
}

// YAML timestamps parse to Date instances (js-yaml's !!timestamp tag);
// plain frontmatter strings stay strings. Either way the <input type="date">
// value must be a bare "YYYY-MM-DD".
function toDateInputValue(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'string') return value.slice(0, 10);
  return '';
}
