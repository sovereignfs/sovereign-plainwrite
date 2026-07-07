import { describe, expect, it } from 'vitest';
import {
  buildContentFilePath,
  parseMarkdownDocument,
  renderSafeMarkdownPreview,
  serializeMarkdownDocument,
  slugifyFilename,
} from '../editor-rules';

describe('editor rules', () => {
  it('parses and serializes frontmatter without changing the markdown body', () => {
    const parsed = parseMarkdownDocument('---\ntitle: Hello\ndraft: false\n---\n\n# Hello\nBody');

    expect(parsed).toEqual({
      frontmatterYaml: 'title: Hello\ndraft: false',
      body: '# Hello\nBody',
    });
    expect(serializeMarkdownDocument(parsed.frontmatterYaml, parsed.body)).toBe(
      '---\ntitle: Hello\ndraft: false\n---\n\n# Hello\nBody',
    );
  });

  it('builds collection-aware content paths with slugified filenames', () => {
    expect(buildContentFilePath('/src/content/', 'Blog Posts', 'Hello World')).toBe(
      'src/content/blog-posts/hello-world.md',
    );
    expect(buildContentFilePath('src/content', '', 'About.mdx')).toBe('src/content/about.mdx');
  });

  it('normalizes filenames to lowercase kebab-case markdown files', () => {
    expect(slugifyFilename('Launch Notes 2026')).toBe('launch-notes-2026.md');
    expect(slugifyFilename('Already Written.MDX')).toBe('already-written.mdx');
    expect(slugifyFilename('')).toBe('untitled.md');
  });

  it('escapes raw HTML and MDX-like content in previews', () => {
    const preview = renderSafeMarkdownPreview(
      '---\ntitle: Unsafe\n---\n\n# Hello\n<script>alert(1)</script>\n<Component />',
    );

    expect(preview).toContain('<h1>Hello</h1>');
    expect(preview).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(preview).toContain('&lt;Component /&gt;');
    expect(preview).not.toContain('<script>');
  });
});
