import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'ClipFlow 素材搜索工作台',
    short_name: 'ClipFlow',
    description: '聚合搜索、收藏和管理视频剪辑素材。',
    start_url: '/',
    display: 'standalone',
    background_color: '#fafafa',
    theme_color: '#697a35',
    lang: 'zh-CN',
    orientation: 'any',
    icons: [
      {
        src: '/clipflow-icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
      {
        src: '/clipflow-icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'maskable',
      },
    ],
  };
}
