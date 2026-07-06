import { AstroAdapter } from './astro';
import type { SsgAdapter, SsgType } from './types';

export function getAdapter(type: SsgType): SsgAdapter {
  if (type === 'astro') return new AstroAdapter();
  throw new Error(`SSG adapter "${type}" is not implemented yet.`);
}

export type { ContentFile, SsgAdapter, SsgType } from './types';
