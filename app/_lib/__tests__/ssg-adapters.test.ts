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
});

describe('getSsgAdapter', () => {
  it('throws for an unimplemented SSG type', () => {
    expect(() => getSsgAdapter('jekyll')).toThrow('SSG adapter "jekyll" is not implemented yet.');
  });
});
