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
}

export function getSsgAdapter(ssgType: string): SsgAdapter {
  if (ssgType === 'astro') return new AstroAdapter();
  throw new Error(`SSG adapter "${ssgType}" is not implemented yet.`);
}

class AstroAdapter implements SsgAdapter {
  private readonly extensions = ['.md', '.mdx'];

  discoverContent(tree: GitTreeEntry[], pathPrefix: string): ContentFile[] {
    const prefix = trimSlashes(pathPrefix);
    return tree
      .filter((entry) => entry.type === 'file')
      .filter((entry) => entry.path.startsWith(`${prefix}/`))
      .filter((entry) => this.extensions.some((extension) => entry.path.endsWith(extension)))
      .map((entry) => ({
        path: entry.path,
        collection: this.inferCollection(entry.path, prefix),
        filename: entry.path.split('/').at(-1) ?? entry.path,
        sha: entry.sha,
      }))
      .sort((a, b) => a.path.localeCompare(b.path));
  }

  inferCollection(filePath: string, pathPrefix: string): string | null {
    const prefix = trimSlashes(pathPrefix);
    const relative = filePath.slice(prefix.length).replace(/^\/+/, '');
    const parts = relative.split('/').filter(Boolean);
    return parts.length > 1 ? parts[0] ?? null : null;
  }
}

function trimSlashes(value: string): string {
  return value.replace(/^\/+|\/+$/g, '');
}
