import { resolve } from 'node:path';
import { createMDX } from 'fumadocs-mdx/next';

const withMDX = createMDX({
  configPath: './source.config.ts',
});

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: false,
  output: process.env.NODE_ENV === 'production' ? 'export' : undefined,
  distDir: 'dist',
  devIndicators: false,
  turbopack: {
    root: resolve('..'),
  },
  images: {
    unoptimized: true,
  },
};

export default withMDX(config);
