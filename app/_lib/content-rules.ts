import type { ContentFile } from './ssg-adapters';
import { defaultMarkdownTemplate } from './editor-rules';

export type { ContentFile };
export { defaultMarkdownTemplate };

export function groupContentFiles<T extends ContentFile>(files: T[]) {
  const groups = new Map<string, T[]>();
  for (const file of files) {
    const key = file.collection ?? 'Root';
    groups.set(key, [...(groups.get(key) ?? []), file]);
  }
  return [...groups.entries()].map(([collection, collectionFiles]) => ({
    collection,
    files: collectionFiles,
  }));
}
