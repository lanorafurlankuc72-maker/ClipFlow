import dotenv from 'dotenv';
import type { NextConfig } from 'next';
import { resolve } from 'node:path';

dotenv.config({ path: resolve(process.cwd(), '../../.env'), quiet: true });

const nextConfig: NextConfig = {
  transpilePackages: ['@clipflow/providers'],
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [{ key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' }],
      },
    ];
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'pexels.com' },
      { protocol: 'https', hostname: '**.pexels.com' },
      { protocol: 'https', hostname: 'pixabay.com' },
      { protocol: 'https', hostname: '**.pixabay.com' },
      { protocol: 'https', hostname: 'unsplash.com' },
      { protocol: 'https', hostname: '**.unsplash.com' },
      { protocol: 'https', hostname: 'giphy.com' },
      { protocol: 'https', hostname: '**.giphy.com' },
    ],
  },
};

export default nextConfig;
