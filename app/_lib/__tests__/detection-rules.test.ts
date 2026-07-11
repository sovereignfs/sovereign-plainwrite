import { describe, expect, it } from 'vitest';
import type { GitTreeEntry } from '../git-providers';
import { countPostsUnderPrefix, suggestPathPrefix } from '../detection-rules';

function file(path: string): GitTreeEntry {
  return { path, type: 'file', sha: 'sha' };
}
function dir(path: string): GitTreeEntry {
  return { path, type: 'directory', sha: 'sha' };
}

describe('suggestPathPrefix', () => {
  it('prefers src/content when present, even if not the shortest common ancestor', () => {
    const entries = [
      file('src/content/blog/hello.md'),
      file('src/content/blog/world.md'),
      file('README.md'),
    ];

    expect(suggestPathPrefix(entries)).toBe('src/content');
  });

  it('falls back to the shortest common ancestor directory of markdown files', () => {
    const entries = [file('content/posts/one.md'), file('content/posts/two.mdx'), dir('content/posts')];

    expect(suggestPathPrefix(entries)).toBe('content/posts');
  });

  it('returns an empty-string prefix when markdown files sit at the repo root', () => {
    const entries = [file('hello.md'), file('world.md')];

    expect(suggestPathPrefix(entries)).toBe('');
  });

  it('returns null when there is no markdown content at all', () => {
    const entries = [file('package.json'), file('src/index.ts')];

    expect(suggestPathPrefix(entries)).toBeNull();
  });

  it('finds the common ancestor across differently-nested markdown files', () => {
    const entries = [file('docs/guides/deep/one.md'), file('docs/two.md')];

    expect(suggestPathPrefix(entries)).toBe('docs');
  });
});

describe('countPostsUnderPrefix', () => {
  it('counts only markdown files under the given prefix', () => {
    const entries = [
      file('src/content/blog/one.md'),
      file('src/content/blog/two.mdx'),
      file('src/content/pages/about.md'),
      file('README.md'),
    ];

    expect(countPostsUnderPrefix(entries, 'src/content/blog')).toBe(2);
    expect(countPostsUnderPrefix(entries, 'src/content')).toBe(3);
  });

  it('treats an empty prefix as "everything at any depth"', () => {
    const entries = [file('one.md'), file('nested/two.md')];

    expect(countPostsUnderPrefix(entries, '')).toBe(2);
  });

  it('tolerates leading/trailing slashes in the prefix', () => {
    const entries = [file('src/content/one.md')];

    expect(countPostsUnderPrefix(entries, '/src/content/')).toBe(1);
  });
});
