import type { GitTreeEntry } from './git-providers';

const MARKDOWN_EXTENSION = /\.(md|mdx)$/i;

/**
 * Guesses where a site's content lives from its file tree, for the
 * "Connect a site" wizard's detection step. `src/content` is Astro's own
 * convention (the framework itself expects content collections there), so
 * it's checked first even if some other directory happens to have more
 * markdown files. Otherwise falls back to the shortest common ancestor
 * directory of every markdown/MDX file found. Returns null when the repo
 * has no markdown content at all — the wizard falls back to a sensible
 * default and lets the user adjust it manually.
 */
export function suggestPathPrefix(entries: GitTreeEntry[]): string | null {
  const markdownPaths = entries
    .filter((entry) => entry.type === 'file' && MARKDOWN_EXTENSION.test(entry.path))
    .map((entry) => entry.path);
  if (markdownPaths.length === 0) return null;
  if (markdownPaths.some((path) => path.startsWith('src/content/'))) return 'src/content';

  const directories = markdownPaths.map((path) => path.split('/').slice(0, -1));
  const shortest = Math.min(...directories.map((dir) => dir.length));
  const common: string[] = [];
  for (let i = 0; i < shortest; i += 1) {
    const segment = directories[0]?.[i];
    if (segment !== undefined && directories.every((dir) => dir[i] === segment)) {
      common.push(segment);
    } else {
      break;
    }
  }
  return common.join('/');
}

/** Counts markdown/MDX files under a given path prefix — the wizard's "N posts found". */
export function countPostsUnderPrefix(entries: GitTreeEntry[], pathPrefix: string): number {
  const normalized = pathPrefix.replace(/^\/+|\/+$/g, '');
  const withSlash = normalized ? `${normalized}/` : '';
  return entries.filter(
    (entry) => entry.type === 'file' && MARKDOWN_EXTENSION.test(entry.path) && entry.path.startsWith(withSlash),
  ).length;
}
