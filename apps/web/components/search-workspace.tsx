'use client';

import type { Asset, ProviderStatus, SearchAssetType, SearchResult } from '@clipflow/providers';
import {
  ArrowUpRight,
  Clock3,
  Download,
  Film,
  FolderOpen,
  FolderPlus,
  Heart,
  Image as ImageIcon,
  LoaderCircle,
  Menu,
  Play,
  Plus,
  Search,
  Settings2,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import Image from 'next/image';
import { FormEvent, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000';
const HISTORY_KEY = 'clipflow-search-history';
const PAGE_SIZE = 24;

interface ProjectSummary {
  id: string;
  name: string;
  description: string;
  assetCount: number;
  createdAt: string;
  updatedAt: string;
}

interface Project extends ProjectSummary {
  assets: Asset[];
}

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

function VideoPreviewDialog({ asset, onClose }: { asset: Asset; onClose: () => void }) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-4 sm:p-8"
      role="dialog"
      aria-modal="true"
      aria-label={`预览 ${asset.title}`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-5xl overflow-hidden rounded-xl bg-[#111] text-white shadow-2xl">
        <div className="flex items-center justify-between gap-4 px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{asset.title}</p>
            <p className="mt-0.5 text-xs text-white/65">
              {asset.provider} · {asset.author.name}
            </p>
          </div>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={onClose}
            aria-label="关闭视频预览"
            className="shrink-0 text-white hover:bg-white/10 hover:text-white"
          >
            <X size={20} />
          </Button>
        </div>
        <video
          src={asset.previewUrl}
          poster={asset.thumbnailUrl}
          controls
          autoPlay
          playsInline
          className="max-h-[calc(100vh-10rem)] w-full bg-black object-contain"
        />
      </div>
    </div>
  );
}

function ProjectPickerDialog({
  asset,
  projects,
  onChoose,
  onClose,
}: {
  asset: Asset;
  projects: ProjectSummary[];
  onChoose: (projectId: string, asset: Asset) => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/55 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`选择项目：${asset.title}`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-xl bg-white p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold">加入项目</h2>
            <p className="mt-1 line-clamp-1 text-sm text-[var(--muted)]">{asset.title}</p>
          </div>
          <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="关闭">
            <X size={18} />
          </Button>
        </div>
        {projects.length ? (
          <div className="mt-5 divide-y divide-[var(--line)] border-y border-[var(--line)]">
            {projects.map((project) => (
              <button
                key={project.id}
                type="button"
                className="flex w-full items-center justify-between gap-3 py-3 text-left hover:text-[var(--primary-ink)] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[var(--focus)]"
                onClick={() => onChoose(project.id, asset)}
              >
                <span>
                  <span className="block text-sm font-semibold">{project.name}</span>
                  <span className="mt-0.5 block text-xs text-[var(--muted)]">
                    {project.assetCount} 条素材
                  </span>
                </span>
                <FolderPlus size={18} />
              </button>
            ))}
          </div>
        ) : (
          <div className="mt-5 rounded-lg bg-[var(--surface)] p-4 text-sm text-[var(--muted)]">
            请先进入“项目”创建一个项目。
          </div>
        )}
      </div>
    </div>
  );
}

function ProjectsWorkspace({
  projects,
  selectedProject,
  favoriteIds,
  onCreate,
  onSelect,
  onDelete,
  onRemoveAsset,
  onPreview,
  onToggleFavorite,
  onDownload,
}: {
  projects: ProjectSummary[];
  selectedProject: Project | null;
  favoriteIds: Set<string>;
  onCreate: (name: string) => Promise<void>;
  onSelect: (projectId: string) => void;
  onDelete: (project: ProjectSummary) => void;
  onRemoveAsset: (projectId: string, asset: Asset) => void;
  onPreview: (asset: Asset) => void;
  onToggleFavorite: (asset: Asset) => void;
  onDownload: (asset: Asset) => void;
}) {
  const [name, setName] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) return;
    setIsCreating(true);
    await onCreate(name.trim());
    setName('');
    setIsCreating(false);
  }

  return (
    <section id="projects" className="mx-auto max-w-[1440px] px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-5 border-b border-[var(--line)] pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-[var(--muted)]">素材工作区</p>
          <h1 className="mt-1 text-2xl font-bold tracking-[-0.025em]">项目</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">按剪辑任务归档候选素材。</p>
        </div>
        <form onSubmit={create} className="flex w-full gap-2 sm:max-w-md">
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="输入项目名称"
            aria-label="项目名称"
            maxLength={80}
          />
          <Button type="submit" disabled={isCreating || !name.trim()}>
            {isCreating ? <LoaderCircle size={17} className="animate-spin" /> : <Plus size={17} />}
            新建
          </Button>
        </form>
      </div>

      <div className="mt-7 grid gap-8 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside>
          {projects.length ? (
            <div className="divide-y divide-[var(--line)] border-y border-[var(--line)]">
              {projects.map((project) => (
                <div key={project.id} className="group/project flex items-center gap-2 py-2">
                  <button
                    type="button"
                    onClick={() => onSelect(project.id)}
                    className={cn(
                      'min-w-0 flex-1 rounded-lg px-2 py-2 text-left focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[var(--focus)]',
                      selectedProject?.id === project.id && 'bg-[var(--primary-soft)]',
                    )}
                  >
                    <span className="block truncate text-sm font-semibold">{project.name}</span>
                    <span className="mt-1 block text-xs text-[var(--muted)]">
                      {project.assetCount} 条素材
                    </span>
                  </button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="shrink-0 opacity-100 lg:opacity-0 lg:group-hover/project:opacity-100 lg:focus-visible:opacity-100"
                    onClick={() => onDelete(project)}
                    aria-label={`删除项目 ${project.name}`}
                  >
                    <Trash2 size={16} />
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl bg-[var(--surface)] p-5">
              <FolderOpen size={20} className="text-[var(--muted)]" />
              <p className="mt-3 text-sm font-semibold">还没有项目</p>
              <p className="mt-1 text-sm leading-6 text-[var(--muted)]">
                在上方输入名称，创建第一个剪辑项目。
              </p>
            </div>
          )}
        </aside>

        <div>
          {selectedProject ? (
            <>
              <div className="mb-5 flex items-end justify-between border-b border-[var(--line)] pb-4">
                <div>
                  <h2 className="text-xl font-bold">{selectedProject.name}</h2>
                  <p className="mt-1 text-sm text-[var(--muted)]">
                    {selectedProject.assetCount} 条素材
                  </p>
                </div>
              </div>
              {selectedProject.assets.length ? (
                <div className="columns-1 gap-4 sm:columns-2 xl:columns-3">
                  {selectedProject.assets.map((asset) => (
                    <AssetCard
                      key={asset.id}
                      asset={asset}
                      isFavorite={favoriteIds.has(asset.id)}
                      onPreview={onPreview}
                      onToggleFavorite={onToggleFavorite}
                      onDownload={onDownload}
                      onRemoveFromProject={() => onRemoveAsset(selectedProject.id, asset)}
                    />
                  ))}
                </div>
              ) : (
                <div className="py-14 text-center">
                  <FolderPlus className="mx-auto text-[var(--muted)]" size={24} />
                  <h3 className="mt-3 font-semibold">项目中还没有素材</h3>
                  <p className="mt-1 text-sm text-[var(--muted)]">
                    在搜索结果中点击文件夹按钮即可加入。
                  </p>
                </div>
              )}
            </>
          ) : (
            <div className="py-14 text-center text-sm text-[var(--muted)]">
              选择左侧项目查看素材。
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function AssetCard({
  asset,
  isFavorite,
  onPreview,
  onToggleFavorite,
  onDownload,
  onAddToProject,
  onRemoveFromProject,
}: {
  asset: Asset;
  isFavorite: boolean;
  onPreview: (asset: Asset) => void;
  onToggleFavorite: (asset: Asset) => void;
  onDownload: (asset: Asset) => void;
  onAddToProject?: (asset: Asset) => void;
  onRemoveFromProject?: () => void;
}) {
  return (
    <article className="group mb-4 break-inside-avoid overflow-hidden rounded-xl bg-white">
      <div className="relative overflow-hidden bg-[var(--surface)]">
        <Image
          src={asset.thumbnailUrl}
          alt={asset.title}
          width={asset.width || 800}
          height={asset.height || 600}
          unoptimized={asset.type === 'gif'}
          className="h-auto w-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.02]"
        />
        {asset.type === 'video' && (
          <button
            type="button"
            onClick={() => onPreview(asset)}
            className="absolute inset-0 grid place-items-center bg-black/0 transition-colors hover:bg-black/10 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-white/90"
            aria-label={`打开视频预览：${asset.title}`}
          >
            <span className="grid size-12 place-items-center rounded-full bg-black/70 text-white shadow-sm transition-transform group-hover:scale-105">
              <Play size={20} fill="currentColor" />
            </span>
          </button>
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
              aria-label={isFavorite ? `取消收藏 ${asset.title}` : `收藏 ${asset.title}`}
              aria-pressed={isFavorite}
              onClick={() => onToggleFavorite(asset)}
              className={cn('size-9 bg-white/95', isFavorite && 'text-[var(--primary-ink)]')}
            >
              <Heart size={16} fill={isFavorite ? 'currentColor' : 'none'} />
            </Button>
            {onAddToProject && (
              <Button
                size="icon"
                variant="secondary"
                aria-label={`加入项目 ${asset.title}`}
                className="size-9 bg-white/95"
                onClick={() => onAddToProject(asset)}
              >
                <FolderPlus size={16} />
              </Button>
            )}
            {onRemoveFromProject && (
              <Button
                size="icon"
                variant="secondary"
                aria-label={`从项目移除 ${asset.title}`}
                className="size-9 bg-white/95"
                onClick={onRemoveFromProject}
              >
                <X size={16} />
              </Button>
            )}
            <Button size="icon" variant="secondary" asChild className="size-9 bg-white/95">
              <a
                href={asset.contentUrl}
                target="_blank"
                rel="noreferrer"
                onClick={() => onDownload(asset)}
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
  const [selectedPreview, setSelectedPreview] = useState<Asset | null>(null);
  const [favorites, setFavorites] = useState<Asset[]>([]);
  const [showFavorites, setShowFavorites] = useState(false);
  const [showProjects, setShowProjects] = useState(false);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [projectAsset, setProjectAsset] = useState<Asset | null>(null);
  const [notice, setNotice] = useState('');
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => () => controllerRef.current?.abort(), []);

  useEffect(() => {
    let active = true;
    void fetch(`${API_BASE_URL}/favorites`)
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error())))
      .then((payload: { assets: Asset[] }) => {
        if (active) setFavorites(payload.assets);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    void fetch(`${API_BASE_URL}/project`)
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error())))
      .then((payload: { projects: ProjectSummary[] }) => {
        if (active) setProjects(payload.projects);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(''), 2200);
    return () => window.clearTimeout(timeout);
  }, [notice]);

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
      setShowFavorites(false);
      setShowProjects(false);
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

  async function toggleFavorite(asset: Asset) {
    const wasFavorite = favorites.some((favorite) => favorite.id === asset.id);
    setFavorites((current) =>
      wasFavorite ? current.filter((favorite) => favorite.id !== asset.id) : [asset, ...current],
    );
    setNotice(wasFavorite ? '已取消收藏' : '已加入收藏');

    try {
      const response = await fetch(
        wasFavorite
          ? `${API_BASE_URL}/favorite/${encodeURIComponent(asset.id)}`
          : `${API_BASE_URL}/favorite`,
        {
          method: wasFavorite ? 'DELETE' : 'POST',
          headers: wasFavorite ? undefined : { 'Content-Type': 'application/json' },
          body: wasFavorite ? undefined : JSON.stringify(asset),
        },
      );
      if (!response.ok) throw new Error('收藏保存失败');
    } catch {
      setFavorites((current) =>
        wasFavorite ? [asset, ...current] : current.filter((favorite) => favorite.id !== asset.id),
      );
      setNotice('收藏保存失败，请重试');
    }
  }

  function recordDownload(asset: Asset) {
    void fetch(`${API_BASE_URL}/download`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(asset),
    });
    setNotice('已打开素材并记录下载');
  }

  async function createProject(name: string) {
    try {
      const response = await fetch(`${API_BASE_URL}/project`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (!response.ok) throw new Error();
      const payload = (await response.json()) as { project: Project };
      setProjects((current) => [payload.project, ...current]);
      setSelectedProject(payload.project);
      setNotice('项目已创建');
    } catch {
      setNotice('项目创建失败，请重试');
    }
  }

  async function selectProject(projectId: string) {
    try {
      const response = await fetch(`${API_BASE_URL}/project/${encodeURIComponent(projectId)}`);
      if (!response.ok) throw new Error();
      const payload = (await response.json()) as { project: Project };
      setSelectedProject(payload.project);
    } catch {
      setNotice('项目加载失败，请重试');
    }
  }

  async function deleteProject(project: ProjectSummary) {
    if (!window.confirm(`确定删除项目“${project.name}”吗？项目中的素材归档会被移除。`)) return;
    try {
      const response = await fetch(`${API_BASE_URL}/project/${encodeURIComponent(project.id)}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error();
      setProjects((current) => current.filter((item) => item.id !== project.id));
      if (selectedProject?.id === project.id) setSelectedProject(null);
      setNotice('项目已删除');
    } catch {
      setNotice('项目删除失败，请重试');
    }
  }

  async function addAssetToProject(projectId: string, asset: Asset) {
    try {
      const response = await fetch(
        `${API_BASE_URL}/project/${encodeURIComponent(projectId)}/assets`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(asset),
        },
      );
      if (!response.ok) throw new Error();
      const payload = (await response.json()) as { project: Project };
      setProjects((current) =>
        current.map((project) =>
          project.id === projectId
            ? { ...project, assetCount: payload.project.assetCount }
            : project,
        ),
      );
      if (selectedProject?.id === projectId) setSelectedProject(payload.project);
      setProjectAsset(null);
      setNotice(`已加入“${payload.project.name}”`);
    } catch {
      setNotice('加入项目失败，请重试');
    }
  }

  async function removeAssetFromProject(projectId: string, asset: Asset) {
    try {
      const response = await fetch(
        `${API_BASE_URL}/project/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(asset.id)}`,
        { method: 'DELETE' },
      );
      if (!response.ok) throw new Error();
      const payload = (await response.json()) as { project: Project };
      setSelectedProject(payload.project);
      setProjects((current) =>
        current.map((project) =>
          project.id === projectId
            ? { ...project, assetCount: payload.project.assetCount }
            : project,
        ),
      );
      setNotice('素材已从项目移除');
    } catch {
      setNotice('移除失败，请重试');
    }
  }

  const favoriteIds = new Set(favorites.map((asset) => asset.id));
  const displayAssets = showFavorites ? favorites : (result?.assets ?? []);
  const hasSearchState = showFavorites || isLoading || result || error;

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
            <a
              className={cn('nav-link', !showFavorites && !showProjects && 'nav-link-active')}
              href="#search"
              onClick={() => {
                setShowFavorites(false);
                setShowProjects(false);
              }}
            >
              搜索
            </a>
            <button
              type="button"
              className={cn('nav-link', showFavorites && 'nav-link-active')}
              onClick={() => {
                setShowFavorites(true);
                setShowProjects(false);
              }}
            >
              收藏
            </button>
            <button
              type="button"
              className={cn('nav-link', showProjects && 'nav-link-active')}
              onClick={() => {
                setShowProjects(true);
                setShowFavorites(false);
                if (!selectedProject && projects[0]) void selectProject(projects[0].id);
              }}
            >
              项目
            </button>
            <a className="nav-link" href="#history">
              历史
            </a>
          </nav>
          <div className="hidden items-center gap-2 md:flex">
            <Button
              variant="secondary"
              onClick={() => {
                setShowFavorites((current) => !current);
                setShowProjects(false);
              }}
            >
              <Heart size={16} fill={showFavorites ? 'currentColor' : 'none'} />
              收藏 {favorites.length}
            </Button>
            <Button variant="ghost" size="icon" aria-label="设置">
              <Settings2 size={18} />
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setShowProjects(true);
                setShowFavorites(false);
              }}
            >
              新建项目
            </Button>
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
              <a
                className={cn('nav-link', !showFavorites && !showProjects && 'nav-link-active')}
                href="#search"
                onClick={() => {
                  setShowFavorites(false);
                  setShowProjects(false);
                  setMobileMenuOpen(false);
                }}
              >
                搜索
              </a>
              <button
                type="button"
                className={cn('nav-link text-left', showFavorites && 'nav-link-active')}
                onClick={() => {
                  setShowFavorites(true);
                  setShowProjects(false);
                  setMobileMenuOpen(false);
                }}
              >
                收藏 {favorites.length}
              </button>
              <button
                type="button"
                className={cn('nav-link text-left', showProjects && 'nav-link-active')}
                onClick={() => {
                  setShowProjects(true);
                  setShowFavorites(false);
                  setMobileMenuOpen(false);
                  if (!selectedProject && projects[0]) void selectProject(projects[0].id);
                }}
              >
                项目
              </button>
              <a className="nav-link" href="#history">
                历史
              </a>
            </div>
          </nav>
        </div>
      )}

      {selectedPreview && (
        <VideoPreviewDialog asset={selectedPreview} onClose={() => setSelectedPreview(null)} />
      )}

      {projectAsset && (
        <ProjectPickerDialog
          asset={projectAsset}
          projects={projects}
          onChoose={(projectId, asset) => void addAssetToProject(projectId, asset)}
          onClose={() => setProjectAsset(null)}
        />
      )}

      {notice && (
        <div
          className="fixed bottom-5 right-5 z-60 rounded-lg bg-[var(--ink)] px-4 py-3 text-sm font-medium text-white shadow-lg"
          role="status"
        >
          {notice}
        </div>
      )}

      <main id="top">
        {showProjects ? (
          <ProjectsWorkspace
            projects={projects}
            selectedProject={selectedProject}
            favoriteIds={favoriteIds}
            onCreate={createProject}
            onSelect={(projectId) => void selectProject(projectId)}
            onDelete={(project) => void deleteProject(project)}
            onRemoveAsset={(projectId, asset) => void removeAssetFromProject(projectId, asset)}
            onPreview={setSelectedPreview}
            onToggleFavorite={(asset) => void toggleFavorite(asset)}
            onDownload={recordDownload}
          />
        ) : (
          <>
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
                        className={cn(
                          'filter-button',
                          type === option.value && 'filter-button-active',
                        )}
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
                      <p className="text-sm text-[var(--muted)]">
                        {showFavorites ? '素材库' : '搜索结果'}
                      </p>
                      <h2 className="mt-1 text-2xl font-bold tracking-[-0.025em]">
                        {showFavorites
                          ? '我的收藏'
                          : result
                            ? `“${result.query}”`
                            : isLoading
                              ? '正在聚合素材…'
                              : '搜索未完成'}
                      </h2>
                      {showFavorites ? (
                        <p className="mt-1 text-sm text-[var(--muted)]">
                          共 {favorites.length} 条素材
                        </p>
                      ) : result ? (
                        <p className="mt-1 text-sm text-[var(--muted)]">
                          去重后 {result.total} 条 · {result.elapsedMs} ms
                        </p>
                      ) : null}
                      {!showFavorites && result?.analysis?.usedAi && (
                        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                          <span className="inline-flex items-center gap-1.5 font-semibold text-[var(--primary-ink)]">
                            <Sparkles size={14} /> AI 已拆解
                          </span>
                          {result.analysis.keywords.map((keyword) => (
                            <span key={keyword} className="provider-chip">
                              {keyword}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    {!showFavorites && result && (
                      <div className="flex flex-wrap gap-2">
                        {result.providers.map((status) => (
                          <ProviderBadge key={status.provider} status={status} />
                        ))}
                      </div>
                    )}
                  </div>

                  {!showFavorites && error && (
                    <div
                      className="rounded-xl bg-[var(--error-soft)] p-5 text-[var(--error)]"
                      role="alert"
                    >
                      <p className="font-semibold">无法完成搜索</p>
                      <p className="mt-1 text-sm">{error}。请确认 API 服务正在运行后重试。</p>
                    </div>
                  )}
                  {!showFavorites && isLoading && <SkeletonResults />}
                  {displayAssets.length ? (
                    <>
                      <div className="columns-1 gap-4 sm:columns-2 lg:columns-3 xl:columns-4">
                        {displayAssets.map((asset) => (
                          <AssetCard
                            key={asset.id}
                            asset={asset}
                            isFavorite={favoriteIds.has(asset.id)}
                            onPreview={setSelectedPreview}
                            onToggleFavorite={(item) => void toggleFavorite(item)}
                            onDownload={recordDownload}
                            onAddToProject={setProjectAsset}
                          />
                        ))}
                      </div>
                      {!showFavorites && hasMore && (
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
                    (result || showFavorites) && (
                      <div className="mx-auto max-w-xl py-14 text-center">
                        <div className="mx-auto grid size-12 place-items-center rounded-xl bg-[var(--surface-strong)] text-[var(--muted)]">
                          <Search size={22} />
                        </div>
                        <h3 className="mt-4 text-lg font-semibold">
                          {showFavorites ? '还没有收藏素材' : '还没有可展示的素材'}
                        </h3>
                        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[var(--muted)]">
                          {showFavorites
                            ? '在搜索结果中点击心形按钮，素材会保存在这里。'
                            : '请在根目录的 .env 中配置至少一个 Provider API Key，然后重新启动服务。已配置的平台会自动加入下一次聚合搜索。'}
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
          </>
        )}
      </main>
    </div>
  );
}
