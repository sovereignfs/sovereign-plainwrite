import matter from 'gray-matter';

export interface MarkdownDocument {
  frontmatterYaml: string;
  /** Parsed frontmatter, keyed by field name. Empty object when frontmatter is empty or invalid. */
  data: Record<string, unknown>;
  body: string;
}

/**
 * Parses via gray-matter (same library `schema-rules.ts` uses for schema
 * inference) so the live editor and schema inference agree on what "the
 * frontmatter" means for a file — including YAML edge cases (quoting,
 * multi-line values, `---` inside strings) a hand-rolled regex would miss.
 * Invalid YAML falls back to an empty `data` object rather than throwing —
 * the raw `frontmatterYaml` text is preserved untouched either way, so
 * nothing is lost, structured-field rendering just can't populate from it.
 */
export function parseMarkdownDocument(content: string): MarkdownDocument {
  try {
    const parsed = matter(content);
    return {
      frontmatterYaml: (parsed.matter ?? '').trim(),
      data: (parsed.data ?? {}) as Record<string, unknown>,
      body: parsed.content.replace(/^\r?\n/, ''),
    };
  } catch {
    return { frontmatterYaml: '', data: {}, body: content };
  }
}

/**
 * Serializes a structured-field data object back into raw YAML text (no
 * `---` fences) for the raw-YAML source of truth. Preserves any keys not
 * covered by the collection schema — structured-mode editing only touches
 * schema-known fields, so unrecognized frontmatter must round-trip
 * unchanged rather than being silently dropped.
 */
export function serializeStructuredFrontmatter(data: Record<string, unknown>): string {
  const entries = Object.entries(data).filter(([, value]) => value !== undefined);
  if (entries.length === 0) return '';
  const doc = matter.stringify('', Object.fromEntries(entries));
  return (matter(doc).matter ?? '').trim();
}

export function serializeMarkdownDocument(frontmatterYaml: string, body: string) {
  const yaml = frontmatterYaml.trim();
  if (!yaml) return body;
  return `---\n${yaml}\n---\n\n${body}`;
}

export function defaultFrontmatterYaml(filePath: string) {
  return `title: ${titleFromPath(filePath)}`;
}

export function defaultMarkdownTemplate(filePath: string) {
  return serializeMarkdownDocument(defaultFrontmatterYaml(filePath), 'Start writing here.\n');
}

export function titleFromPath(filePath: string) {
  const filename = filePath.split('/').at(-1)?.replace(/\.(mdx?|MDX?)$/, '') ?? 'untitled';
  const title = filename
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
  return title || 'Untitled';
}

export function slugifyFilename(value: string) {
  const extension = /\.mdx$/i.test(value) ? '.mdx' : '.md';
  const withoutExtension = value.replace(/\.(mdx?|MDX?)$/, '');
  const slug = withoutExtension
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${slug || 'untitled'}${extension}`;
}

export function buildContentFilePath(pathPrefix: string, collection: string, filename: string) {
  const prefix = trimSlashes(pathPrefix);
  const normalizedCollection = trimSlashes(collection)
    .split('/')
    .filter(Boolean)
    .map((part) => slugifyPathSegment(part))
    .filter(Boolean)
    .join('/');
  return [prefix, normalizedCollection, slugifyFilename(filename)].filter(Boolean).join('/');
}

export function renderSafeMarkdownPreview(markdown: string) {
  const { body } = parseMarkdownDocument(markdown);
  const lines = body.split(/\r?\n/);
  const blocks: string[] = [];
  let listItems: string[] = [];

  function flushList() {
    if (listItems.length === 0) return;
    blocks.push(`<ul>${listItems.map((item) => `<li>${renderInline(item)}</li>`).join('')}</ul>`);
    listItems = [];
  }

  for (const line of lines) {
    if (!line.trim()) {
      flushList();
      continue;
    }

    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      flushList();
      const level = heading[1]?.length ?? 1;
      blocks.push(`<h${level}>${renderInline(heading[2] ?? '')}</h${level}>`);
      continue;
    }

    const listItem = /^[-*]\s+(.+)$/.exec(line);
    if (listItem) {
      listItems.push(listItem[1] ?? '');
      continue;
    }

    flushList();
    blocks.push(`<p>${renderInline(line)}</p>`);
  }

  flushList();
  return blocks.join('\n');
}

function renderInline(value: string) {
  return escapeHtml(value)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function trimSlashes(value: string) {
  return value.replace(/^\/+|\/+$/g, '');
}

function slugifyPathSegment(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
