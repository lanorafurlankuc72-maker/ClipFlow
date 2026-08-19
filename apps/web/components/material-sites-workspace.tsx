'use client';

import Image from 'next/image';
import {
  ExternalLink,
  Film,
  Image as ImageIcon,
  LogIn,
  Music2,
  Search,
  Sparkles,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { materialSites, type MaterialSite, type MaterialSiteCategory } from '@/lib/material-sites';
import { cn } from '@/lib/utils';

type CategoryFilter = MaterialSiteCategory;

const categories: Array<{
  value: CategoryFilter;
  label: string;
  icon: typeof ImageIcon;
}> = [
  { value: 'image', label: '图片素材', icon: ImageIcon },
  { value: 'video', label: '视频素材', icon: Film },
  { value: 'audio', label: '音乐素材', icon: Music2 },
];

const categoryLabels: Record<MaterialSiteCategory, string> = {
  image: '图片',
  video: '视频',
  audio: '音乐 / 音效',
};

function SiteCard({ site }: { site: MaterialSite }) {
  const [logoFailed, setLogoFailed] = useState(false);
  const useLettermark = logoFailed || site.logo.startsWith('http');

  return (
    <a
      href={site.url}
      target="_blank"
      rel="noreferrer"
      className="group flex min-h-36 flex-col rounded-xl border border-[var(--line)] bg-white p-3 transition-[border-color,background-color,transform] duration-200 ease-out hover:-translate-y-0.5 hover:border-[var(--primary)] hover:bg-[var(--primary-soft)] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[var(--focus)]"
      aria-label={`打开 ${site.name}`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-lg border border-[var(--line)] bg-white p-1.5">
          {useLettermark ? (
            <span
              className="grid size-full place-items-center rounded bg-[var(--surface-strong)] text-xs font-bold text-[var(--ink)]"
              aria-hidden="true"
            >
              {site.name
                .split(/\s+/)
                .slice(0, 2)
                .map((part) => part.slice(0, 1))
                .join('')
                .toLocaleUpperCase()}
            </span>
          ) : (
            <Image
              src={site.logo}
              alt=""
              width={28}
              height={28}
              className="size-full object-contain"
              onError={() => setLogoFailed(true)}
            />
          )}
        </span>
        <span className="flex items-center gap-1.5">
          {site.featured && (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-[var(--primary-ink)]">
              <Sparkles size={11} aria-hidden="true" /> 推荐
            </span>
          )}
          <ExternalLink
            size={14}
            className="mt-0.5 shrink-0 text-[var(--subtle)] transition group-hover:text-[var(--primary)]"
          />
        </span>
      </div>

      <h2 className="mt-2.5 truncate text-sm font-bold text-[var(--ink)]">{site.name}</h2>
      <p className="mt-1 line-clamp-2 text-xs leading-[1.55] text-[var(--muted)]">
        {site.description}
      </p>

      <div className="mt-auto flex items-end justify-between gap-2 pt-2.5 text-[11px]">
        <span className="inline-flex min-w-0 items-center gap-1 truncate text-[var(--subtle)]">
          {site.loginRequired && <LogIn size={11} aria-hidden="true" />}
          {site.loginRequired ? '需登录' : categoryLabels[site.category]}
        </span>
        <span className="shrink-0 rounded-md bg-[var(--surface)] px-1.5 py-0.5 font-medium text-[var(--muted)]">
          {site.access}
        </span>
      </div>
    </a>
  );
}

export function MaterialSitesWorkspace() {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<CategoryFilter>('image');
  const [freeOnly, setFreeOnly] = useState(false);
  const [noLoginOnly, setNoLoginOnly] = useState(false);
  const visibleSites = useMemo(() => {
    const keyword = query.trim().toLocaleLowerCase();
    return materialSites
      .filter((site) => {
        const matchesCategory = site.category === category;
        const matchesQuery =
          !keyword ||
          site.name.toLocaleLowerCase().includes(keyword) ||
          site.description.toLocaleLowerCase().includes(keyword);
        const matchesAccess = !freeOnly || site.access === '免费';
        const matchesLogin = !noLoginOnly || !site.loginRequired;
        return matchesCategory && matchesQuery && matchesAccess && matchesLogin;
      })
      .sort((a, b) => Number(Boolean(b.featured)) - Number(Boolean(a.featured)));
  }, [category, freeOnly, noLoginOnly, query]);

  return (
    <section className="mx-auto max-w-[1480px] px-4 py-7 sm:px-6 lg:px-10 lg:py-9">
      <div className="flex flex-col gap-5 border-b border-[var(--line)] pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-[-0.035em]">素材站点</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">
            ClipFlow 精选的图片、视频与音乐素材网站，点击卡片直接前往原站。
          </p>
        </div>
        <label className="relative block w-full lg:max-w-xs">
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--subtle)]"
            size={17}
          />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="h-10 border border-[var(--line)] pl-10 text-sm"
            placeholder="搜索当前分类"
            aria-label="搜索素材站点"
          />
        </label>
      </div>

      <div className="mt-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-1">
          <div className="flex flex-wrap gap-1" role="group" aria-label="素材站点分类">
            {categories.map((item) => {
              const CategoryIcon = item.icon;
              return (
                <button
                  key={item.value}
                  type="button"
                  aria-pressed={category === item.value}
                  onClick={() => setCategory(item.value)}
                  className={cn(
                    'filter-button gap-1.5',
                    category === item.value && 'filter-button-active',
                  )}
                >
                  <CategoryIcon size={14} />
                  {item.label}
                </button>
              );
            })}
          </div>
          <span className="mx-1 hidden h-5 w-px bg-[var(--line)] sm:block" aria-hidden="true" />
          <div className="flex flex-wrap gap-1" role="group" aria-label="素材站点条件">
            <button
              type="button"
              aria-pressed={freeOnly}
              onClick={() => setFreeOnly((current) => !current)}
              className={cn('filter-button', freeOnly && 'filter-button-active')}
            >
              仅免费
            </button>
            <button
              type="button"
              aria-pressed={noLoginOnly}
              onClick={() => setNoLoginOnly((current) => !current)}
              className={cn('filter-button', noLoginOnly && 'filter-button-active')}
            >
              无需登录
            </button>
          </div>
        </div>
        <p className="text-xs text-[var(--subtle)]">{visibleSites.length} 个站点</p>
      </div>

      {visibleSites.length ? (
        <div className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 2xl:grid-cols-8">
          {visibleSites.map((site) => (
            <SiteCard key={`${site.category}-${site.name}`} site={site} />
          ))}
        </div>
      ) : (
        <div className="py-20 text-center">
          <Search className="mx-auto text-[var(--subtle)]" size={24} />
          <h2 className="mt-3 font-semibold">没有找到对应站点</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">试试更换关键词。</p>
        </div>
      )}

      <p className="mt-7 border-t border-[var(--line)] pt-4 text-xs leading-5 text-[var(--subtle)]">
        各网站的免费范围和授权条款可能调整。下载与发布素材前，请在原网站确认当前授权要求。
      </p>
    </section>
  );
}
