import { resolve } from 'node:path';
import { createMDX } from 'fumadocs-mdx/next';

const withMDX = createMDX({
  configPath: './source.config.ts',
});

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: false,
  output: process.env.PREVIEW_MODE ? undefined : (process.env.NODE_ENV === 'production' ? 'export' : undefined),
  basePath: process.env.VELU_BASE_PATH || '',
  // For static hosts without rewrite rules, emit directory routes
  // (e.g. /docs/page/index.html) so extensionless URLs resolve.
  trailingSlash: true,
  skipTrailingSlashRedirect: true,
  distDir: process.env.PREVIEW_MODE ? '.next' : 'dist',
  devIndicators: false,
  turbopack: {
    root: resolve('..'),
  },
  images: {
    unoptimized: true,
  },
  webpack: (webpackConfig) => {
    webpackConfig.resolve.alias['@core'] = resolve('./engine-core');
    return webpackConfig;
  },
};

export default withMDX(config);
