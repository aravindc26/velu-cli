import { defineConfig, defineDocs } from 'fumadocs-mdx/config';
import { metaSchema, pageSchema } from 'fumadocs-core/source/schema';

// Content directory: NFS-backed preview_content root.
// Each session writes to {PREVIEW_CONTENT_DIR}/{sessionId}/.
// fumadocs scans the entire directory; routes filter by session.
const contentDir = process.env.PREVIEW_CONTENT_DIR || './content';

export const docs = defineDocs({
  dir: contentDir,
  docs: {
    schema: pageSchema,
  },
  meta: {
    schema: metaSchema,
  },
});

export default defineConfig({
  mdxOptions: {
    rehypeCodeOptions: ({
      lazy: false,
      fallbackLanguage: 'bash',
    } as any),
  },
});
