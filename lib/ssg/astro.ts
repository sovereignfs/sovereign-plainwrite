import type { ContentFile, SsgAdapter } from './types';
import type { TreeEntry } from '../providers/types';

function trimSlashes(value: string): string {
  return value.replace(/^\/+|\/+$/g, '');
}

export class AstroAdapter implements SsgAdapter {
  defaultPathPrefix = 'src/content';
  defaultExtensions = ['.md', '.mdx'];

  discoverContent(tree: TreeEntry[], pathPrefix: string): ContentFile[] {
    const prefix = trimSlashes(pathPrefix);
    return tree
      .filter((entry) => entry.type === 'file')
      .filter((entry) => entry.path.startsWith(`${prefix}/`))
      .filter((entry) => this.defaultExtensions.some((extension) => entry.path.endsWith(extension)))
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

  defaultFrontmatterTemplate(collection: string | null): Record<string, unknown> {
    return {
      title: '',
      ...(collection ? { collection } : {}),
    };
  }
}
