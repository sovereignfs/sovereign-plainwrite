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

const jekyllTree: GitTreeEntry[] = [
  { path: '_posts/2024-01-05-hello-world.md', type: 'file', sha: 'sha-post-1' },
  { path: '_posts/2024-02-10-second-post.markdown', type: 'file', sha: 'sha-post-2' },
  { path: '_pages/about.md', type: 'file', sha: 'sha-page' },
  { path: '_drafts/unfinished-idea.md', type: 'file', sha: 'sha-draft' },
  { path: '_posts/2024-01-05-hello-world.png', type: 'file', sha: 'sha-image' },
  { path: '_layouts/post.html', type: 'file', sha: 'sha-layout' },
  { path: '_posts', type: 'directory', sha: 'sha-dir' },
  { path: 'index.md', type: 'file', sha: 'sha-index' },
];

describe('Jekyll adapter', () => {
  it('discovers posts, pages, and drafts at the repository root', () => {
    const adapter = getSsgAdapter('jekyll');

    expect(adapter.discoverContent(jekyllTree, '')).toEqual([
      {
        path: '_drafts/unfinished-idea.md',
        collection: 'drafts',
        filename: 'unfinished-idea.md',
        sha: 'sha-draft',
      },
      {
        path: '_pages/about.md',
        collection: 'pages',
        filename: 'about.md',
        sha: 'sha-page',
      },
      {
        path: '_posts/2024-01-05-hello-world.md',
        collection: 'posts',
        filename: '2024-01-05-hello-world.md',
        sha: 'sha-post-1',
      },
      {
        path: '_posts/2024-02-10-second-post.markdown',
        collection: 'posts',
        filename: '2024-02-10-second-post.markdown',
        sha: 'sha-post-2',
      },
    ]);
  });

  it('infers collection names from the Jekyll directory convention', () => {
    const adapter = getSsgAdapter('jekyll');

    expect(adapter.inferCollection('_posts/2024-01-05-hello-world.md', '')).toBe('posts');
    expect(adapter.inferCollection('_pages/about.md', '')).toBe('pages');
    expect(adapter.inferCollection('_drafts/unfinished-idea.md', '')).toBe('drafts');
    expect(adapter.inferCollection('index.md', '')).toBeNull();
  });

  it('allows a Markdown path inside a recognized collection directory', () => {
    const adapter = getSsgAdapter('jekyll');

    expect(adapter.isPathAllowed('_posts/2024-01-05-hello-world.md', '')).toBe(true);
    expect(adapter.isPathAllowed('_posts/2024-02-10-second-post.markdown', '')).toBe(true);
  });

  it('rejects a path outside the three recognized collection directories', () => {
    const adapter = getSsgAdapter('jekyll');

    expect(adapter.isPathAllowed('index.md', '')).toBe(false);
    expect(adapter.isPathAllowed('_layouts/post.html', '')).toBe(false);
    expect(adapter.isPathAllowed('_projects/custom-collection.md', '')).toBe(false);
  });

  it('rejects a path inside a collection directory with an unsupported extension', () => {
    const adapter = getSsgAdapter('jekyll');

    expect(adapter.isPathAllowed('_posts/2024-01-05-hello-world.png', '')).toBe(false);
  });

  it('supports a non-root path prefix for Jekyll content nested in a subdirectory', () => {
    const nestedTree: GitTreeEntry[] = [
      { path: 'site/_posts/2024-01-05-hello-world.md', type: 'file', sha: 'sha-nested' },
    ];
    const adapter = getSsgAdapter('jekyll');

    expect(adapter.discoverContent(nestedTree, 'site')).toEqual([
      {
        path: 'site/_posts/2024-01-05-hello-world.md',
        collection: 'posts',
        filename: '2024-01-05-hello-world.md',
        sha: 'sha-nested',
      },
    ]);
  });
});

describe('getSsgAdapter', () => {
  it('throws for an unimplemented SSG type', () => {
    expect(() => getSsgAdapter('hugo')).toThrow('SSG adapter "hugo" is not implemented yet.');
  });
});
