import { describe, expect, it } from 'vitest';
import { getSsgAdapter } from '../ssg-adapters';
import type { GitTreeEntry } from '../git-providers';

const tree: GitTreeEntry[] = [
  { path: 'src/content/blog/hello-world.md', type: 'file', sha: 'sha-blog' },
  { path: 'src/content/articles/deep-dive.mdx', type: 'file', sha: 'sha-article' },
  { path: 'src/content/root-page.md', type: 'file', sha: 'sha-root' },
  { path: 'src/content/blog/image.png', type: 'file', sha: 'sha-image' },
  { path: 'src/content/blog', type: 'directory', sha: 'sha-dir' },
  { path: 'src/pages/about.md', type: 'file', sha: 'sha-page' },
];

describe('Astro adapter', () => {
  it('discovers Markdown and MDX files under the configured path prefix', () => {
    const adapter = getSsgAdapter('astro');

    expect(adapter.discoverContent(tree, 'src/content')).toEqual([
      {
        path: 'src/content/articles/deep-dive.mdx',
        collection: 'articles',
        filename: 'deep-dive.mdx',
        sha: 'sha-article',
      },
      {
        path: 'src/content/blog/hello-world.md',
        collection: 'blog',
        filename: 'hello-world.md',
        sha: 'sha-blog',
      },
      {
        path: 'src/content/root-page.md',
        collection: null,
        filename: 'root-page.md',
        sha: 'sha-root',
      },
    ]);
  });

  it('treats files directly inside the path prefix as root content', () => {
    const adapter = getSsgAdapter('astro');

    expect(adapter.inferCollection('src/content/root-page.md', 'src/content')).toBeNull();
    expect(adapter.inferCollection('src/content/blog/hello-world.md', 'src/content')).toBe('blog');
  });

  it('normalizes slash-wrapped path prefixes', () => {
    const adapter = getSsgAdapter('astro');

    expect(adapter.discoverContent(tree, '/src/content/')).toHaveLength(3);
  });

  it('allows a Markdown/MDX path inside the configured path prefix', () => {
    const adapter = getSsgAdapter('astro');

    expect(adapter.isPathAllowed('src/content/blog/hello-world.md', 'src/content')).toBe(true);
    expect(adapter.isPathAllowed('src/content/articles/deep-dive.mdx', 'src/content')).toBe(true);
  });

  it('rejects a path outside the configured path prefix', () => {
    const adapter = getSsgAdapter('astro');

    expect(adapter.isPathAllowed('.github/workflows/deploy.yml', 'src/content')).toBe(false);
    expect(adapter.isPathAllowed('src/pages/about.md', 'src/content')).toBe(false);
  });

  it('rejects a path inside the prefix with an unsupported extension', () => {
    const adapter = getSsgAdapter('astro');

    expect(adapter.isPathAllowed('src/content/blog/image.png', 'src/content')).toBe(false);
  });
});

describe('getSsgAdapter', () => {
  it('throws for an unimplemented SSG type', () => {
    expect(() => getSsgAdapter('jekyll')).toThrow('SSG adapter "jekyll" is not implemented yet.');
  });
});
