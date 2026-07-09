import { describe, expect, it } from 'vitest';
import { inferCollectionSchema, parseSchemaJson, schemaFieldsFromForm } from '../schema-rules';

describe('schema rules', () => {
  it('infers editable frontmatter fields from Markdown samples', () => {
    const schema = inferCollectionSchema([
      '---\ntitle: Hello\npublished: true\ntags: [news]\ndate: 2026-07-07\n---\nBody',
      '---\ntitle: Again\npublished: false\ntags: [notes]\nviews: 4\n---\nBody',
    ]);

    expect(schema).toEqual([
      { name: 'date', type: 'date', required: false },
      { name: 'published', type: 'boolean', required: true },
      { name: 'tags', type: 'array', required: true },
      { name: 'title', type: 'string', required: true },
      { name: 'views', type: 'number', required: false },
    ]);
  });

  it('normalizes schema form rows and ignores blank rows', () => {
    const formData = new FormData();
    formData.append('fieldName', 'title');
    formData.append('fieldName', '');
    formData.append('fieldType', 'string');
    formData.append('fieldType', 'boolean');
    formData.append('fieldRequired', '0');

    expect(schemaFieldsFromForm(formData)).toEqual([
      { name: 'title', type: 'string', required: true },
    ]);
  });

  it('rejects invalid stored schema JSON', () => {
    expect(() => parseSchemaJson('[{"name":"title","type":"object"}]')).toThrow(
      'Schema field "title" has an invalid type.',
    );
  });
});
