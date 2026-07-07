export interface MarkdownDocument {
  frontmatterYaml: string;
  body: string;
}

export function parseMarkdownDocument(content: string): MarkdownDocument {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(content);
  if (!match) {
    return { frontmatterYaml: '', body: content };
  }

  return {
    frontmatterYaml: match[1]!.trim(),
    body: content.slice(match[0].length).replace(/^\r?\n/, ''),
  };
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
      const level = heading[1]!.length;
      blocks.push(`<h${level}>${renderInline(heading[2]!)}</h${level}>`);
      continue;
    }

    const listItem = /^[-*]\s+(.+)$/.exec(line);
    if (listItem) {
      listItems.push(listItem[1]!);
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
