import { loader } from 'fumadocs-core/source';
import { docs } from 'fumadocs-mdx:collections/server';
import { getLanguages } from '@/lib/velu';

const languages = getLanguages();
const defaultLanguage = languages[0] ?? 'en';

export const source = loader({
  baseUrl: '/',
  source: docs.toFumadocsSource(),
  i18n:
    languages.length > 1
      ? {
          languages,
          defaultLanguage,
          hideLocale: 'default-locale',
          parser: 'dir',
          fallbackLanguage: defaultLanguage,
        }
      : undefined,
});
