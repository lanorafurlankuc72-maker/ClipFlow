import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { PwaRegister } from '@/components/pwa-register';
import './globals.css';

export const metadata: Metadata = {
  title: 'ClipFlow — AI 剪辑素材搜索工作台',
  description: '跨 Pexels、Pixabay、Unsplash 和 GIPHY 搜索剪辑素材。',
  applicationName: 'ClipFlow',
  manifest: '/manifest.webmanifest',
  icons: { icon: '/clipflow-icon.svg', apple: '/clipflow-icon.svg' },
};

export const viewport: Viewport = {
  themeColor: '#697a35',
  colorScheme: 'light',
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body>
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}
