import type { TreeEntry } from '../providers/types';

export type SsgType = 'astro' | 'jekyll' | 'custom';

export interface ContentFile {
  path: string;
  collection: string | null;
  filename: string;
  sha: string;
}

export interface SsgAdapter {
  defaultPathPrefix: string;
  defaultExtensions: string[];
  discoverContent(tree: TreeEntry[], pathPrefix: string): ContentFile[];
  inferCollection(filePath: string, pathPrefix: string): string | null;
  defaultFrontmatterTemplate(collection: string | null): Record<string, unknown>;
}
