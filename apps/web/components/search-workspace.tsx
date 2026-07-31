'use client';

import type { Asset, ProviderStatus, SearchAssetType, SearchResult } from '@clipflow/providers';
import {
  ArrowUpRight,
  Clock3,
  Download,
  Film,
  Heart,
  Image as ImageIcon,
  LoaderCircle,
  Menu,
  Search,
  Settings2,
  Sparkles,
  X,
} from 'lucide-react';
import Image from 'next/image';
import {
  FormEvent,
  KeyboardEvent,
  MouseEvent,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000';
const HISTORY_KEY = 'clipflow-search-history';
const PAGE_SIZE = 24;

const popularSearches = ['城市航拍夜景', '商务会议握手', '新能源汽车工厂', '咖啡制作特写'];
const recommendations = [
  { label: '自然光人物采访', detail: '人物 · 室内 · 纪录片感' },
  { label: '科技产品发布会', detail: '舞台 · 大屏 · 观众' },
  { label: '夏日旅行氛围', detail: '海岸 · 公路 · 慢镜头' },
];
const typeOptions: Array<{ value: SearchAssetType; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'video', label: '视频' },
  { value: 'image', label: '图片' },
  { value: 'gif', label: '动图' },
];

function getHistorySnapshot(): string {
  try {
    return window.localStorage.getItem(HISTORY_KEY) ?? '[]';
  } catch {
    return '[]';
  }
}

function subscribeHistory(callback: () => void) {
  window.addEventListener('clipflow-history', callback);
  window.addEventListener('storage', callback);
  return () => {
    window.removeEventListener('clipflow-history', callback);
    window.removeEventListener('storage', callback);
  };
}

function parseHistory(value: string): string[] {
  try {
    const history = JSON.parse(value) as unknown;
    return Array.isArray(history)
      ? history.filter((item): item is string => typeof item === 'string').slice(0, 5)
      : [];
  } catch {
    return [];
  }
}

function ProviderBadge({ status }: { status: ProviderStatus }) {
  const statusText = {
    ok: `${status.count} 条`,
    unconfigured: '待配置',
    error: '失败',
    skipped: '已跳过',
  }[status.status];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
        status.status === 'ok' && 'bg-[var(--success-soft)] text-[var(--success)]',
        status.status === 'unconfigured' && 'bg-[var(--warning-soft)] text-[var(--warning)]',
        status.status === 'error' && 'bg-[var(--error-soft)] text-[var(--error)]',
        status.status === 'skipped' && 'bg-[var(--surface)] text-[var(--muted)]',
      )}
      title={status.message}
    >
      <span className="capitalize">{status.provider}</span>
      <span aria-hidden="true">·</span>
      {statusText}
    </span>
  );
}

function VideoPreview({ asset }: { asset: Asset }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const seekFrameRef = useRef<number | null>(null);
  const pendingTimeRef = useRef(0);
  const [progress, setProgress] = useState(0);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [duration, setDuration] = useState(asset.duration ?? 0);

  useEffect(
    () => () => {
      if (seekFrameRef.current !== null) cancelAnimationFrame(seekFrameRef.current);
    },
    [],
  );

  function seekTo(nextProgress: number) {
    const video = videoRef.current;
    if (!video || !Number.isFinite(video.duration) || video.duration <= 0) return;

    const normalizedProgress = Math.min(1, Math.max(0, nextProgress));
    setProgress(normalizedProgress);
    pendingTimeRef.current = normalizedProgress * video.duration;
    if (!video.seeking) video.currentTime = pendingTimeRef.current;
  }

  async function activatePreview() {
    setIsPreviewing(true);
    const video = videoRef.current;
    if (!video) return;
    try {
      await video.play();
      video.pause();
    } catch {
      // Seeking still works when autoplay is unavailable.
    }
  }

  function continuePendingSeek() {
    const video = videoRef.current;
    if (!video || Math.abs(video.currentTime - pendingTimeRef.current) < 0.04) return;
    if (seekFrameRef.current !== null) cancelAnimationFrame(seekFrameRef.current);
    seekFrameRef.current = requestAnimationFrame(() => {
      if (videoRef.current) videoRef.current.currentTime = pendingTimeRef.current;
      seekFrameRef.current = null;
    });
  }

  function scrubFromMouse(event: MouseEvent<HTMLDivElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    seekTo((event.clientX - bounds.left) / bounds.width);
  }

  function scrubFromKeyboard(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    setIsPreviewing(true);
    seekTo(progress + (event.key === 'ArrowRight' ? 0.05 : -0.05));
  }

  const previewSeconds = Math.round(duration * progress);

  return (
    <div
      className="relative cursor-ew-resize outline-none focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-white/90"
      tabIndex={0}
      role="slider"
      aria-label={`${asset.title} 视频预览进度`}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(progress * 100)}
      aria-valuetext={`${previewSeconds} 秒`}
      onMouseEnter={() => void activatePreview()}
      onMouseMove={scrubFromMouse}
      onMouseLeave={() => setIsPreviewing(false)}
      onKeyDown={scrubFromKeyboard}
      onBlur={() => setIsPreviewing(false)}
    >
      <video
        ref={videoRef}
        src={asset.previewUrl}
        poster={isPreviewing ? undefined : asset.thumbnailUrl}
        muted
        playsInline
        preload="metadata"
        aria-hidden="true"
        onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)}
        onSeeked={continuePendingSeek}
        className="h-auto w-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.02]"
        style={{ aspectRatio: `${asset.width || 16} / ${asset.height || 9}` }}
      />
      <div
        className={cn(
          'pointer-events-none absolute inset-x-0 top-0 transition-opacity duration-150',
          isPreviewing ? 'opacity-100' : 'opacity-0',
        )}
      >
        <div className="h-1 bg-white/35">
          <div className="h-full bg-white" style={{ width: `${progress * 100}%` }} />
        </div>
        <span className="absolute left-2 top-2 rounded-md bg-black/65 px-2 py-1 text-[11px] font-semibold text-white">
          左右移动预览 · {previewSeconds}s
        </span>
      </div>
    </div>
  );
}

function AssetCard({ asset }: { asset: Asset }) {
  return (
    <article className="group mb-4 break-inside-avoid overflow-hidden rounded-xl bg-white">
      <div className="relative overflow-hidden bg-[var(--surface)]">
        {asset.type === 'video' ? (
          <VideoPreview asset={asset} />
        ) : (
          <Image
            src={asset.thumbnailUrl}
            alt={asset.title}
            width={asset.width || 800}
            height={asset.height || 600}
            unoptimized={asset.type === 'gif'}
            className="h-auto w-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.02]"
          />
        )}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 bg-linear-to-t from-black/70 to-transparent p-3 pt-10 text-white">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold capitalize">
            {asset.type === 'video' ? <Film size={14} /> : <ImageIcon size={14} />}
            {asset.provider}
            {asset.duration ? ` · ${asset.duration}s` : ''}
          </span>
          <div className="pointer-events-auto flex gap-1 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100">
            <Button
              size="icon"
              variant="secondary"
              aria-label={`收藏 ${asset.title}`}
              className="size-9 bg-white/95"
            >
              <Heart size={16} />
            </Button>
            <Button size="icon" variant="secondary" asChild className="size-9 bg-white/95">
              <a
                href={asset.contentUrl}
                target="_blank"
                rel="noreferrer"
                aria-label={`打开下载地址：${asset.title}`}
              >
                <Download size={16} />
              </a>
            </Button>
          </div>
        </div>
      </div>
      <div className="flex items-start justify-between gap-3 px-1 py-3">
        <div className="min-w-0">
          <h3 className="line-clamp-2 text-sm font-semibold text-[var(--ink)]">{asset.title}</h3>
          <p className="mt-1 truncate text-xs text-[var(--muted)]">{asset.author.name}</p>
        </div>
        <a
          href={asset.sourceUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-0.5 shrink-0 text-[var(--muted)] hover:text-[var(--ink)] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[var(--focus)]"
          aria-label={`在 ${asset.provider} 查看原始素材`}
        >
          <ArrowUpRight size={17} />
        </a>
      </div>
    </article>
  );
}

function SkeletonResults() {
  return (
    <div
      className="columns-1 gap-4 sm:columns-2 lg:columns-3 xl:columns-4"
      aria-label="正在加载搜索结果"
    >
      {[260, 340, 220, 300, 250, 360, 280, 230].map((height, index) => (
        <div key={index} className="mb-4 break-inside-avoid overflow-hidden rounded-xl bg-white">
          <div className="skeleton" style={{ height }} />
          <div className="space-y-2 p-3">
            <div className="skeleton h-4 w-4/5" />
            <div className="skeleton h-3 w-2/5" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function SearchWorkspace() {
  const [query, setQuery] = useState('');
  const [type, setType] = useState<SearchAssetType>('all');
  const historyJson = useSyncExternalStore(subscribeHistory, getHistorySnapshot, () => '[]');
  const history = parseHistory(historyJson);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [activeSearch, setActiveSearch] = useState<{
    query: string;
    type: SearchAssetType;
    page: number;
  } | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => () => controllerRef.current?.abort(), []);

  async function search(
    nextQuery: string,
    nextPage = 1,
    append = false,
    nextType: SearchAssetType = type,
  ) {
    const normalized = nextQuery.trim();
    if (normalized.length < 2) {
      setError('请至少输入 2 个字符');
      return;
    }

    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    if (append) setIsLoadingMore(true);
    else setIsLoading(true);
    setError('');
    if (!append) {
      setResult(null);
      setHasMore(false);
    }

    if (!append) {
      const nextHistory = [normalized, ...history.filter((item) => item !== normalized)].slice(
        0,
        5,
      );
      window.localStorage.setItem(HISTORY_KEY, JSON.stringify(nextHistory));
      window.dispatchEvent(new Event('clipflow-history'));
    }

    try {
      const response = await fetch(`${API_BASE_URL}/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: normalized,
          type: nextType,
          page: nextPage,
          perPage: PAGE_SIZE,
        }),
        signal: controller.signal,
      });
      const payload = (await response.json()) as SearchResult | { message?: string };
      if (!response.ok) throw new Error('message' in payload ? payload.message : '搜索失败');
      const nextResult = payload as SearchResult;
      if (append) {
        setResult((current) => {
          if (!current) return nextResult;
          const seen = new Set(current.assets.map((asset) => asset.id));
          const newAssets = nextResult.assets.filter((asset) => !seen.has(asset.id));
          const previousStatuses = new Map(
            current.providers.map((status) => [status.provider, status]),
          );
          const providers = nextResult.providers.map((status) => {
            const previous = previousStatuses.get(status.provider);
            return status.status === 'ok' && previous?.status === 'ok'
              ? { ...status, count: previous.count + status.count }
              : status;
          });
          const assets = [...current.assets, ...newAssets];
          return {
            ...nextResult,
            assets,
            providers,
            total: assets.length,
            elapsedMs: current.elapsedMs + nextResult.elapsedMs,
          };
        });
      } else {
        setResult(nextResult);
      }
      setActiveSearch({ query: normalized, type: nextType, page: nextPage });
      setHasMore(
        nextResult.providers.some((status) => status.status === 'ok' && status.count >= PAGE_SIZE),
      );
    } catch (searchError) {
      if (searchError instanceof DOMException && searchError.name === 'AbortError') return;
      setError(searchError instanceof Error ? searchError.message : '无法连接搜索服务');
    } finally {
      if (controllerRef.current === controller) {
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void search(query);
  }

  function choosePrompt(value: string) {
    setQuery(value);
    void search(value);
  }

  function loadMore() {
    if (!activeSearch || isLoadingMore) return;
    void search(activeSearch.query, activeSearch.page + 1, true, activeSearch.type);
  }

  const hasSearchState = isLoading || result || error;

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--ink)]">
      <header className="sticky top-0 z-20 border-b border-[var(--line)] bg-white/95 backdrop-blur-sm">
        <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between px-4 sm:px-6 lg:px-8">
          <a
            href="#top"
            className="flex items-center gap-2.5 font-bold tracking-[-0.02em] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[var(--focus)]"
          >
            <span className="grid size-8 place-items-center rounded-lg bg-[var(--primary)] text-white">
              <Film size={17} aria-hidden="true" />
            </span>
            <span>ClipFlow</span>
          </a>
          <nav className="hidden items-center gap-1 md:flex" aria-label="主要导航">
            <a className="nav-link nav-link-active" href="#search">
              搜索
            </a>
            <a className="nav-link" href="#projects">
              项目
            </a>
            <a className="nav-link" href="#history">
              历史
            </a>
          </nav>
          <div className="hidden items-center gap-2 md:flex">
            <Button variant="ghost" size="icon" aria-label="设置">
              <Settings2 size={18} />
            </Button>
            <Button variant="secondary">新建项目</Button>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            aria-label="打开菜单"
            onClick={() => setMobileMenuOpen(true)}
          >
            <Menu size={20} />
          </Button>
        </div>
      </header>

      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/25 md:hidden"
          role="presentation"
          onClick={() => setMobileMenuOpen(false)}
        >
          <nav
            className="ml-auto h-full w-72 bg-white p-5"
            aria-label="移动端导航"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-8 flex items-center justify-between font-bold">
              ClipFlow
              <Button
                variant="ghost"
                size="icon"
                aria-label="关闭菜单"
                onClick={() => setMobileMenuOpen(false)}
              >
                <X size={20} />
              </Button>
            </div>
            <div className="flex flex-col gap-2">
              <a className="nav-link nav-link-active" href="#search">
                搜索
              </a>
              <a className="nav-link" href="#projects">
                项目
              </a>
              <a className="nav-link" href="#history">
                历史
              </a>
            </div>
          </nav>
        </div>
      )}

      <main id="top">
        <section id="search" className="border-b border-[var(--line)] bg-white">
          <div className="mx-auto max-w-[1120px] px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
            <div className="max-w-3xl">
              <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-[var(--primary-soft)] px-3 py-1.5 text-sm font-semibold text-[var(--primary-ink)]">
                <Sparkles size={15} aria-hidden="true" />
                四个平台，一次搜索
              </div>
              <h1 className="text-balance text-4xl font-bold tracking-[-0.035em] sm:text-5xl">
                描述你想要的画面，
                <br className="hidden sm:block" />
                素材搜索从这里开始。
              </h1>
              <p className="mt-5 max-w-2xl text-pretty text-base leading-7 text-[var(--muted)] sm:text-lg">
                同时查询 Pexels、Pixabay、Unsplash 与 GIPHY，统一整理来源与结果。
              </p>
            </div>

            <form onSubmit={submit} className="mt-9" aria-label="素材搜索">
              <div className="search-shell flex flex-col gap-2 p-2 sm:flex-row">
                <div className="relative flex-1">
                  <Search
                    className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--muted)]"
                    size={20}
                  />
                  <Input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    className="border-0 pl-12 ring-0 focus-visible:ring-0"
                    placeholder="例如：新能源汽车工厂，航拍，清晨"
                    aria-label="描述需要的素材"
                  />
                </div>
                <Button type="submit" size="lg" disabled={isLoading} className="sm:min-w-28">
                  {isLoading ? (
                    <LoaderCircle className="animate-spin" size={18} />
                  ) : (
                    <Search size={18} />
                  )}
                  {isLoading ? '搜索中' : '搜索'}
                </Button>
              </div>
              <div
                className="mt-3 flex flex-wrap items-center gap-2"
                role="group"
                aria-label="素材类型"
              >
                {typeOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={type === option.value}
                    onClick={() => setType(option.value)}
                    className={cn('filter-button', type === option.value && 'filter-button-active')}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </form>
          </div>
        </section>

        <div className="mx-auto max-w-[1440px] px-4 py-8 sm:px-6 lg:px-8">
          {hasSearchState ? (
            <section aria-live="polite">
              <div className="mb-6 flex flex-col gap-4 border-b border-[var(--line)] pb-5 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-sm text-[var(--muted)]">搜索结果</p>
                  <h2 className="mt-1 text-2xl font-bold tracking-[-0.025em]">
                    {result ? `“${result.query}”` : isLoading ? '正在聚合素材…' : '搜索未完成'}
                  </h2>
                  {result && (
                    <p className="mt-1 text-sm text-[var(--muted)]">
                      去重后 {result.total} 条 · {result.elapsedMs} ms
                    </p>
                  )}
                </div>
                {result && (
                  <div className="flex flex-wrap gap-2">
                    {result.providers.map((status) => (
                      <ProviderBadge key={status.provider} status={status} />
                    ))}
                  </div>
                )}
              </div>

              {error && (
                <div
                  className="rounded-xl bg-[var(--error-soft)] p-5 text-[var(--error)]"
                  role="alert"
                >
                  <p className="font-semibold">无法完成搜索</p>
                  <p className="mt-1 text-sm">{error}。请确认 API 服务正在运行后重试。</p>
                </div>
              )}
              {isLoading && <SkeletonResults />}
              {result?.assets.length ? (
                <>
                  <div className="columns-1 gap-4 sm:columns-2 lg:columns-3 xl:columns-4">
                    {result.assets.map((asset) => (
                      <AssetCard key={asset.id} asset={asset} />
                    ))}
                  </div>
                  {hasMore && (
                    <div className="flex justify-center border-t border-[var(--line)] pt-7">
                      <Button
                        type="button"
                        variant="secondary"
                        size="lg"
                        onClick={loadMore}
                        disabled={isLoadingMore}
                        className="min-w-36"
                      >
                        {isLoadingMore && <LoaderCircle className="animate-spin" size={18} />}
                        {isLoadingMore ? '加载中…' : '加载更多'}
                      </Button>
                    </div>
                  )}
                </>
              ) : (
                result && (
                  <div className="mx-auto max-w-xl py-14 text-center">
                    <div className="mx-auto grid size-12 place-items-center rounded-xl bg-[var(--surface-strong)] text-[var(--muted)]">
                      <Search size={22} />
                    </div>
                    <h3 className="mt-4 text-lg font-semibold">还没有可展示的素材</h3>
                    <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[var(--muted)]">
                      请在根目录的 .env 中配置至少一个 Provider API
                      Key，然后重新启动服务。已配置的平台会自动加入下一次聚合搜索。
                    </p>
                  </div>
                )
              )}
            </section>
          ) : (
            <div className="grid gap-10 lg:grid-cols-[1.4fr_0.8fr] lg:gap-16">
              <section>
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-bold">热门搜索</h2>
                  <span className="text-sm text-[var(--muted)]">本周</span>
                </div>
                <div className="mt-4 divide-y divide-[var(--line)] border-y border-[var(--line)]">
                  {popularSearches.map((item, index) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => choosePrompt(item)}
                      className="group flex w-full items-center justify-between gap-4 py-4 text-left focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[var(--focus)]"
                    >
                      <span className="flex items-center gap-4">
                        <span className="w-5 text-sm tabular-nums text-[var(--muted)]">
                          {String(index + 1).padStart(2, '0')}
                        </span>
                        <span className="font-medium group-hover:text-[var(--primary-ink)]">
                          {item}
                        </span>
                      </span>
                      <ArrowUpRight
                        size={17}
                        className="text-[var(--muted)] transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
                      />
                    </button>
                  ))}
                </div>

                <div className="mt-10">
                  <h2 className="text-lg font-bold">AI 推荐方向</h2>
                  <div className="mt-4 flex flex-col gap-3">
                    {recommendations.map((item) => (
                      <button
                        key={item.label}
                        type="button"
                        onClick={() => choosePrompt(item.label)}
                        className="recommendation-row"
                      >
                        <span>
                          <span className="block font-semibold">{item.label}</span>
                          <span className="mt-1 block text-sm text-[var(--muted)]">
                            {item.detail}
                          </span>
                        </span>
                        <Sparkles size={17} className="text-[var(--primary-ink)]" />
                      </button>
                    ))}
                  </div>
                </div>
              </section>

              <aside id="history" className="lg:border-l lg:border-[var(--line)] lg:pl-10">
                <div className="flex items-center gap-2">
                  <Clock3 size={18} className="text-[var(--muted)]" />
                  <h2 className="text-lg font-bold">最近搜索</h2>
                </div>
                {history.length ? (
                  <div className="mt-4 flex flex-col">
                    {history.map((item) => (
                      <button
                        key={item}
                        type="button"
                        onClick={() => choosePrompt(item)}
                        className="history-row"
                      >
                        {item}
                        <Search size={15} />
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="mt-5 rounded-xl bg-[var(--surface)] p-5">
                    <p className="text-sm font-semibold">从一次描述开始</p>
                    <p className="mt-1 text-sm leading-6 text-[var(--muted)]">
                      搜索记录会安全保存在当前浏览器，方便你快速再次查找。
                    </p>
                  </div>
                )}
                <div className="mt-8 border-t border-[var(--line)] pt-6">
                  <p className="text-sm font-semibold">已接入 Provider</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {['Pexels', 'Pixabay', 'Unsplash', 'GIPHY'].map((name) => (
                      <span key={name} className="provider-chip">
                        {name}
                      </span>
                    ))}
                  </div>
                  <p className="mt-4 text-xs leading-5 text-[var(--muted)]">
                    结果保留原始来源。下载与使用前请确认对应平台的授权条款。
                  </p>
                </div>
              </aside>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
