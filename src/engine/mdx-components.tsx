import type { MDXComponents } from 'mdx/types';
import { getMDXComponents as getCoreMDXComponents } from '@core/mdx-components';
import { getApiConfig, getIconLibrary, type VeluConfigSource } from '@/lib/velu';

export function getMDXComponents(components?: MDXComponents, src?: VeluConfigSource): MDXComponents {
  const iconLibrary = getIconLibrary(src);
  const apiConfig = getApiConfig(src);
  return getCoreMDXComponents(
    {
      iconLibrary,
      apiConfig: {
        playgroundProxyEnabled: src ? false : apiConfig.playgroundProxyEnabled,
        exampleLanguages: apiConfig.exampleLanguages,
        exampleAutogenerate: apiConfig.exampleAutogenerate,
      },
    },
    components,
  );
}
