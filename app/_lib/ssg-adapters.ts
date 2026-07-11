import type { GitTreeEntry } from './git-providers';

export interface ContentFile {
  path: string;
  collection: string | null;
  filename: string;
  sha: string;
}

export interface SsgAdapter {
  discoverContent(tree: GitTreeEntry[], pathPrefix: string): ContentFile[];
  inferCollection(filePath: string, pathPrefix: string): string | null;
  /**
   * Whether `filePath` is a content file this adapter would ever list —
   * inside `pathPrefix` and using one of the adapter's recognized
   * extensions. Callers that read/write a single file by path (not
   * discovered via `discoverContent`) must use this to keep edits and
   * publishes scoped to what the project's file listing actually shows.
   */
  isPathAllowed(filePath: string, pathPrefix: string): boolean;
}

export function getSsgAdapter(ssgType: string): SsgAdapter {
  if (ssgType === 'astro') return new AstroAdapter();
  if (ssgType === 'jekyll') return new JekyllAdapter();
  throw new Error(`SSG adapter "${ssgType}" is not implemented yet.`);
}

class AstroAdapter implements SsgAdapter {
  private readonly extensions = ['.md', '.mdx'];

  discoverContent(tree: GitTreeEntry[], pathPrefix: string): ContentFile[] {
    const prefix = trimSlashes(pathPrefix);
    return tree
      .filter((entry) => entry.type === 'file')
      .filter((entry) => this.isPathAllowed(entry.path, prefix))
      .map((entry) => ({
        path: entry.path,
        collection: this.inferCollection(entry.path, prefix),
        filename: entry.path.split('/').at(-1) ?? entry.path,
        sha: entry.sha,
      }))
      .sort((a, b) => a.path.localeCompare(b.path));
  }

  inferCollection(filePath: string, pathPrefix: string): string | null {
    const relative = stripPrefix(filePath, trimSlashes(pathPrefix));
    if (relative === null) return null;
    const parts = relative.split('/').filter(Boolean);
    return parts.length > 1 ? parts[0] ?? null : null;
  }

  isPathAllowed(filePath: string, pathPrefix: string): boolean {
    const relative = stripPrefix(filePath, trimSlashes(pathPrefix));
    return relative !== null && this.extensions.some((extension) => filePath.endsWith(extension));
  }
}

/**
 * Jekyll's content lives in a fixed set of underscore-prefixed directories at
 * the configured root (`_posts/`, `_pages/`, `_drafts/`) rather than under a
 * single nested content directory like Astro's `src/content/` — so
 * `pathPrefix` here is typically the repository root (see
 * `normalizePathPrefix`'s `.` convention). Custom Jekyll collections
 * (`_projects/`, etc.) are intentionally out of scope for v0.2; the three
 * directories above cover the standard site structure this task targets.
 */
class JekyllAdapter implements SsgAdapter {
  private readonly extensions = ['.md', '.markdown'];
  private readonly collectionDirs = new Map([
    ['_posts', 'posts'],
    ['_pages', 'pages'],
    ['_drafts', 'drafts'],
  ]);

  discoverContent(tree: GitTreeEntry[], pathPrefix: string): ContentFile[] {
    const prefix = trimSlashes(pathPrefix);
    return tree
      .filter((entry) => entry.type === 'file')
      .filter((entry) => this.isPathAllowed(entry.path, prefix))
      .map((entry) => ({
        path: entry.path,
        collection: this.inferCollection(entry.path, prefix),
        filename: entry.path.split('/').at(-1) ?? entry.path,
        sha: entry.sha,
      }))
      .sort((a, b) => a.path.localeCompare(b.path));
  }

  inferCollection(filePath: string, pathPrefix: string): string | null {
    const relative = stripPrefix(filePath, trimSlashes(pathPrefix));
    if (relative === null) return null;
    const [collectionDir] = relative.split('/');
    return collectionDir ? (this.collectionDirs.get(collectionDir) ?? null) : null;
  }

  isPathAllowed(filePath: string, pathPrefix: string): boolean {
    const relative = stripPrefix(filePath, trimSlashes(pathPrefix));
    if (relative === null) return false;
    const [collectionDir] = relative.split('/');
    return (
      Boolean(collectionDir) &&
      this.collectionDirs.has(collectionDir as string) &&
      this.extensions.some((extension) => filePath.endsWith(extension))
    );
  }
}

function trimSlashes(value: string): string {
  return value.replace(/^\/+|\/+$/g, '');
}

/**
 * Resolves `filePath` relative to `prefix`, or `null` if it's outside the
 * prefix. An empty prefix means "repository root" — every path matches, with
 * the relative path equal to `filePath` itself (no leading-slash join).
 */
function stripPrefix(filePath: string, prefix: string): string | null {
  if (!prefix) return filePath;
  if (!filePath.startsWith(`${prefix}/`)) return null;
  return filePath.slice(prefix.length + 1);
}
