import { defineConfig, defineDocs } from 'fumadocs-mdx/config';
import { metaSchema, pageSchema } from 'fumadocs-core/source/schema';
import { transformerMetaHighlight } from '@shikijs/transformers';
import { remarkCodeFilenameToTitle, sharedRehypeCodeOptions } from '@core/lib/remark-plugins';
import { z } from 'zod';

const contentDir = process.env.PREVIEW_CONTENT_DIR || 'content/docs';

const extendedPageSchema = pageSchema.extend({
  openapi: z.string().optional(),
  deprecated: z.boolean().optional(),
  status: z.string().optional(),
});

export const docs = defineDocs({
  dir: contentDir,
  docs: {
    schema: extendedPageSchema,
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
      ...sharedRehypeCodeOptions,
      transformers: [transformerMetaHighlight()],
    } as any),
  },
});
