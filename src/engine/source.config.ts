import { defineConfig, defineDocs } from 'fumadocs-mdx/config';
import { metaSchema, pageSchema } from 'fumadocs-core/source/schema';
import { transformerMetaHighlight } from '@shikijs/transformers';

function remarkCodeFilenameToTitle() {
  function visit(node: any) {
    if (!node || typeof node !== 'object') return;

    if (node.type === 'code' && typeof node.meta === 'string') {
      let meta = node.meta.trim();
      // Mint-style fence syntax: ```lang filename.ext
      // Convert it into title metadata so code tabs can use file names.
      if (meta && !meta.includes('=') && /\.[a-z0-9_-]+$/i.test(meta)) {
        meta = `title="${meta}"`;
      }

      // Mint-style line highlight syntax: highlight=1 or highlight="1,3-5"
      // Convert to Shiki meta-highlight format: {1,3-5}
      const hlMatch = meta.match(/(?:^|\s)highlight=(?:"([^"]+)"|'([^']+)'|([^\s]+))/i);
      if (hlMatch) {
        const raw = (hlMatch[1] ?? hlMatch[2] ?? hlMatch[3] ?? '').trim();
        const lineSpec = raw.replace(/[{}]/g, '');
        meta = meta.replace(hlMatch[0], '').replace(/\s+/g, ' ').trim();
        if (lineSpec && !/\{\s*\d[\d,\-\s]*\s*\}/.test(meta)) {
          meta = `${meta} {${lineSpec}}`.trim();
        }
      }

      // theme={null} is a Mint docs hint; remove it from fence meta.
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

export const docs = defineDocs({
  dir: 'content/docs',
  docs: {
    schema: pageSchema,
    postprocess: {
      includeProcessedMarkdown: true,
    },
  },
  meta: {
    schema: metaSchema,
  },
});

export default defineConfig({
  mdxOptions: {
    remarkPlugins: [remarkCodeFilenameToTitle],
    rehypeCodeOptions: ({
      lazy: false,
      fallbackLanguage: 'bash',
      transformers: [transformerMetaHighlight()],
      langAlias: {
        gradle: 'groovy',
        proguard: 'properties',
      },
    } as any),
  },
});
