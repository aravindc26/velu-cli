import { resolve } from 'node:path';
import { createMDX } from 'fumadocs-mdx/next';

const withMDX = createMDX({
  configPath: './source.config.ts',
});

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: false,
  devIndicators: false,
  turbopack: {
    root: '/',
  },
  images: {
    unoptimized: true,
  },
};

export default withMDX(config);
