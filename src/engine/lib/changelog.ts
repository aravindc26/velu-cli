export interface ChangelogTocItem {
  title: string;
  url: string;
  depth: number;
}

export interface ChangelogUpdateEntry {
  label: string;
  anchor: string;
  date?: string;
  description?: string;
  tags: string[];
  contentMarkdown: string;
  rssTitle?: string;
  rssDescription?: string;
}

export interface ChangelogHeadingEntry {
  title: string;
  anchor: string;
  contentMarkdown: string;
}

export interface ParsedChangelogData {
  toc: ChangelogTocItem[];
  tags: string[];
  updates: ChangelogUpdateEntry[];
}

interface ParsedRssProp {
  title?: string;
  description?: string;
}

const STRING_LITERAL = /"(.*?)"|'(.*?)'/;

export function slugifyUpdateLabel(value: string): string {
  const base = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `update-${base || 'item'}`;
}

export function slugifyHeading(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'section';
}

function parseStringProp(attributes: string, name: string): string | undefined {
  const regex = new RegExp(`\\b${name}\\s*=\\s*(\"([^\"]+)\"|'([^']+)')`, 'i');
  const match = attributes.match(regex);
  if (!match) return undefined;
  return (match[2] ?? match[3] ?? '').trim() || undefined;
}

function parseTags(attributes: string): string[] {
  const direct = parseStringProp(attributes, 'tags');
  if (direct) return [direct];

  const match = attributes.match(/\btags\s*=\s*\{\s*\[([\s\S]*?)\]\s*\}/i);
  if (!match) return [];

  const tokens = match[1].split(',').map((entry) => entry.trim()).filter(Boolean);
  const tags: string[] = [];
  for (const token of tokens) {
    const literal = token.match(STRING_LITERAL);
    const value = (literal?.[1] ?? literal?.[2] ?? '').trim();
    if (value) tags.push(value);
  }
  return tags;
}

function parseRss(attributes: string): ParsedRssProp {
  const inline = parseStringProp(attributes, 'rss');
  if (inline) {
    return { description: inline };
  }

  const objectMatch = attributes.match(/\brss\s*=\s*\{\s*\{([\s\S]*?)\}\s*\}/i);
  if (!objectMatch) return {};
  const body = objectMatch[1];

  return {
    title: parseStringProp(body, 'title'),
    description: parseStringProp(body, 'description'),
  };
}

export function markdownToPlainText(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\{[^}]+\}/g, '')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function parseHeadings(markdown: string): ChangelogHeadingEntry[] {
  if (!markdown.trim()) return [];

  const matches = Array.from(markdown.matchAll(/^#{1,6}\s+(.+)$/gm));
  if (matches.length === 0) return [];

  const seen = new Map<string, number>();
  const entries: ChangelogHeadingEntry[] = [];

  for (let index = 0; index < matches.length; index += 1) {
    const current = matches[index];
    const next = matches[index + 1];
    const rawTitle = (current[1] ?? '').trim();
    const title = markdownToPlainText(rawTitle) || 'Update';

    const baseSlug = slugifyHeading(title);
    const duplicateCount = seen.get(baseSlug) ?? 0;
    seen.set(baseSlug, duplicateCount + 1);
    const anchor = duplicateCount === 0 ? baseSlug : `${baseSlug}-${duplicateCount}`;

    const bodyStart = (current.index ?? 0) + current[0].length;
    const bodyEnd = next?.index ?? markdown.length;
    const body = markdown.slice(bodyStart, bodyEnd).trim();

    entries.push({
      title,
      anchor,
      contentMarkdown: body,
    });
  }

  return entries;
}

export function parseChangelogFromMarkdown(markdown: string | undefined): ParsedChangelogData {
  if (!markdown) return { toc: [], tags: [], updates: [] };

  const searchable = markdown
    .replace(/```[\s\S]*?```/g, '')
    .replace(/~~~[\s\S]*?~~~/g, '');

  const updates: ChangelogUpdateEntry[] = [];
  const tagSet = new Set<string>();
  const regex = /<Update\b([^>]*)>([\s\S]*?)<\/Update>/gi;

  for (const match of searchable.matchAll(regex)) {
    const attrs = match[1] ?? '';
    const body = (match[2] ?? '').trim();
    const date = parseStringProp(attrs, 'date');
    const label = parseStringProp(attrs, 'label') ?? date ?? 'Update';
    const description = parseStringProp(attrs, 'description');
    const tags = parseTags(attrs);
    const rss = parseRss(attrs);
    const anchor = slugifyUpdateLabel(label);

    for (const tag of tags) tagSet.add(tag);

    updates.push({
      label,
      anchor,
      date,
      description,
      tags,
      contentMarkdown: body,
      rssTitle: rss.title,
      rssDescription: rss.description,
    });
  }

  return {
    toc: updates.map((update) => ({
      title: update.label,
      url: `#${update.anchor}`,
      depth: 2,
    })),
    tags: Array.from(tagSet),
    updates,
  };
}

export function parseFrontmatterValue(markdown: string | undefined, key: string): string | undefined {
  const frontmatterMatch = markdown?.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!frontmatterMatch) return undefined;
  const frontmatter = frontmatterMatch[1];
  const line = frontmatter
    .split(/\r?\n/)
    .find((entry) => entry.trim().toLowerCase().startsWith(`${key.toLowerCase()}:`));
  if (!line) return undefined;

  const raw = line.slice(line.indexOf(':') + 1).trim();
  if (!raw) return undefined;
  const literal = raw.match(STRING_LITERAL);
  return (literal?.[1] ?? literal?.[2] ?? raw).trim();
}

export function parseFrontmatterBoolean(markdown: string | undefined, key: string): boolean {
  const value = parseFrontmatterValue(markdown, key);
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === 'true' || normalized === 'yes' || normalized === '1';
}

export function getUpdateRssEntries(update: ChangelogUpdateEntry): Array<{
  title: string;
  anchor: string;
  description: string;
}> {
  if (update.rssTitle || update.rssDescription) {
    return [
      {
        title: update.rssTitle?.trim() || update.label,
        anchor: update.anchor,
        description: toRssDescription(update),
      },
    ];
  }

  const headings = parseHeadings(update.contentMarkdown);
  if (headings.length > 0) {
    return headings.map((heading) => ({
      title: heading.title,
      anchor: heading.anchor,
      description: markdownToPlainText(heading.contentMarkdown) || toRssDescription(update),
    }));
  }

  return [
    {
      title: update.label,
      anchor: update.anchor,
      description: toRssDescription(update),
    },
  ];
}

export function toRssDescription(update: ChangelogUpdateEntry): string {
  if (update.rssDescription && update.rssDescription.trim()) return update.rssDescription.trim();
  if (update.description && update.description.trim()) return update.description.trim();

  const plain = markdownToPlainText(update.contentMarkdown);
  return plain || update.label;
}
