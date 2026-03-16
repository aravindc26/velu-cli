/**
 * Shared remark plugins used by both main engine and preview engine.
 */

const booleanMetaFlags = new Set([
  'wrap',
  'copy',
  'nocopy',
  'lineNumbers',
  'linenumbers',
  'showLineNumbers',
]);

function quoteTitle(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function ensureTitleMeta(meta: string): string {
  const trimmed = meta.trim();
  if (!trimmed) return trimmed;
  if (/\btitle\s*=/.test(trimmed)) return trimmed;

  const fileWithRest = trimmed.match(/^([^\s]+?\.[a-z0-9_-]+)(\s+.*)?$/i);
  if (fileWithRest) {
    const file = fileWithRest[1];
    const rest = (fileWithRest[2] ?? '').trim();
    return rest ? `title="${quoteTitle(file)}" ${rest}` : `title="${quoteTitle(file)}"`;
  }

  if (!trimmed.includes('=') && !trimmed.includes('{') && !trimmed.includes('}')) {
    if (booleanMetaFlags.has(trimmed)) return trimmed;
    return `title="${quoteTitle(trimmed)}"`;
  }

  return trimmed;
}

/**
 * Remark plugin that converts Mint-style code fence metadata into
 * standard title/highlight syntax that fumadocs understands.
 *
 * Handles:
 * - ```lang filename.ext  →  title="filename.ext"
 * - highlight=1 or highlight="1,3-5"  →  {1,3-5}
 * - theme={null} removal
 */
export function remarkCodeFilenameToTitle() {
  function visit(node: any) {
    if (!node || typeof node !== 'object') return;

    if (node.type === 'code' && typeof node.meta === 'string') {
      let meta = node.meta.trim();
      meta = ensureTitleMeta(meta);

      const hlMatch = meta.match(/(?:^|\s)highlight=(?:"([^"]+)"|'([^']+)'|([^\s]+))/i);
      if (hlMatch) {
        const raw = (hlMatch[1] ?? hlMatch[2] ?? hlMatch[3] ?? '').trim();
        const lineSpec = raw.replace(/[{}]/g, '');
        meta = meta.replace(hlMatch[0], '').replace(/\s+/g, ' ').trim();
        if (lineSpec && !/\{\s*\d[\d,\-\s]*\s*\}/.test(meta)) {
          meta = `${meta} {${lineSpec}}`.trim();
        }
      }

      meta = meta.replace(/\btheme=\{null\}\b/g, '').replace(/\s+/g, ' ').trim();
      node.meta = meta;
    }
    if (node.type === 'code' && typeof node.meta !== 'string') {
      return;
    }

    if (node.type === 'code' && node.meta === '') {
      delete node.meta;
    }

    if (node.type === 'code' && typeof node.meta === 'string') {
      node.meta = node.meta.trim();
      if (!node.meta) {
        delete node.meta;
      }
    }

    const children = node.children;
    if (Array.isArray(children)) {
      for (const child of children) visit(child);
    }
  }

  return (tree: any) => visit(tree);
}

/**
 * Shared rehype code options for consistent syntax highlighting.
 */
export const sharedRehypeCodeOptions = {
  lazy: false,
  fallbackLanguage: 'bash',
  langAlias: {
    gradle: 'groovy',
    proguard: 'properties',
  },
} as const;
