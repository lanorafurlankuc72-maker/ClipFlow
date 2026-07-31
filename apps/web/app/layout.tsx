import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'ClipFlow — AI 剪辑素材搜索工作台',
  description: '跨 Pexels、Pixabay、Unsplash 和 GIPHY 搜索剪辑素材。',
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
