'use client';

import { ArrowUpRight, AudioLines, Clock3, LoaderCircle, Search, Volume2 } from 'lucide-react';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  (process.env.NODE_ENV === 'production'
    ? 'https://clipflow-api-wgrg.onrender.com'
    : 'http://localhost:4000');

interface SoundEffect {
  id: string;
  title: string;
  description: string;
  duration: number;
  previewUrl: string;
  sourceUrl: string;
  author: string;
  license: 'CC0' | 'CC BY';
  licenseUrl: string;
  tags: string[];
  provider: 'freesound';
}

interface SoundSearchResult {
  configured: boolean;
  query: string;
  page: number;
  total: number;
  hasMore: boolean;
  sounds: SoundEffect[];
}

interface SoundWorkspaceProps {
  initialQuery?: string;
}

function formatDuration(value: number) {
  const total = Math.max(0, Math.round(value));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

export function SoundWorkspace({ initialQuery = '' }: SoundWorkspaceProps) {
  const [query, setQuery] = useState(initialQuery);
  const [result, setResult] = useState<SoundSearchResult | null>(null);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);

  async function search(nextQuery: string) {
    const normalized = nextQuery.trim();
    if (normalized.length < 2) {
      setError('请至少输入 2 个字符');
      return;
    }
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setError('');
    setIsLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/sound/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ query: normalized, perPage: 18 }),
        signal: controller.signal,
      });
      const payload = (await response.json()) as SoundSearchResult & { message?: string };
      if (!response.ok) throw new Error(payload.message ?? '音效搜索暂时不可用');
      setResult(payload);
    } catch (searchError) {
      if (searchError instanceof DOMException && searchError.name === 'AbortError') return;
      setError(
        searchError instanceof TypeError
          ? '无法连接音效服务，请稍后重试'
          : searchError instanceof Error
            ? searchError.message
            : '音效搜索暂时不可用',
      );
    } finally {
      if (!controller.signal.aborted) setIsLoading(false);
    }
  }

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      if (initialQuery.trim().length >= 2) void search(initialQuery);
    }, 0);
    return () => {
      window.clearTimeout(timeout);
      controllerRef.current?.abort();
    };
  }, [initialQuery]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void search(query);
  }

  return (
    <section
      className="mx-auto max-w-[1280px] px-4 py-8 sm:px-6 lg:px-10 lg:py-10"
      aria-labelledby="sound-title"
    >
      <div className="border-b border-[var(--line)] pb-7">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-[var(--primary-soft)] text-[var(--primary-ink)]">
            <AudioLines size={20} aria-hidden="true" />
          </span>
          <div>
            <h1 id="sound-title" className="text-2xl font-bold tracking-[-0.025em]">
              音效搜索
            </h1>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-[var(--muted)]">
              搜索环境声、动作声和转场声，先试听，再前往原始页面确认授权与下载。
            </p>
          </div>
        </div>
        <form onSubmit={submit} className="mt-6 flex max-w-3xl flex-col gap-2 sm:flex-row">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="例如：city traffic ambience、coffee cup clink"
            aria-label="音效搜索词"
            className="h-12"
          />
          <Button type="submit" size="lg" disabled={isLoading || query.trim().length < 2}>
            {isLoading ? <LoaderCircle size={18} className="animate-spin" /> : <Search size={18} />}
            搜索音效
          </Button>
        </form>
        <div className="mt-3 flex flex-wrap gap-2 text-xs text-[var(--muted)]">
          <span>快速搜索：</span>
          {(
            [
              ['城市环境', 'busy city traffic ambience'],
              ['脚步声', 'footsteps walking'],
              ['转场', 'cinematic whoosh transition'],
              ['咖啡馆', 'quiet cafe ambience'],
            ] as const
          ).map(([label, value]) => (
            <button
              key={value}
              type="button"
              className="font-semibold hover:text-[var(--primary-ink)] hover:underline focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[var(--focus)]"
              onClick={() => {
                setQuery(value);
                void search(value);
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="mt-6 rounded-lg bg-[var(--error-soft)] px-4 py-3 text-sm text-[var(--error)]">
          {error}
        </div>
      )}

      {isLoading ? (
        <div
          className="mt-8 divide-y divide-[var(--line)] border-y border-[var(--line)]"
          aria-label="正在搜索音效"
        >
          {[1, 2, 3, 4].map((item) => (
            <div key={item} className="animate-pulse py-5">
              <div className="h-4 w-1/3 rounded bg-[var(--surface)]" />
              <div className="mt-3 h-10 max-w-xl rounded bg-[var(--surface)]" />
            </div>
          ))}
        </div>
      ) : result && !result.configured ? (
        <div className="mt-8 rounded-xl bg-[var(--surface)] p-6">
          <h2 className="font-bold">还差一个 Freesound API Key</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">
            音效栏目已经接好。请在 Render 的 Environment 中添加
            FREESOUND_API_KEY，保存并重新部署后即可搜索与试听。
          </p>
        </div>
      ) : result?.sounds.length ? (
        <div className="mt-7">
          <div className="mb-3 flex items-center justify-between gap-4">
            <h2 className="font-bold">搜索结果</h2>
            <span className="text-sm text-[var(--muted)]">找到约 {result.total} 条</span>
          </div>
          <div className="divide-y divide-[var(--line)] border-y border-[var(--line)]">
            {result.sounds.map((sound) => (
              <article
                key={sound.id}
                className="py-5 sm:grid sm:grid-cols-[minmax(0,1fr)_minmax(300px,460px)] sm:items-center sm:gap-8"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Volume2 size={16} className="text-[var(--primary-ink)]" aria-hidden="true" />
                    <h3 className="truncate font-semibold">{sound.title}</h3>
                    <span className="provider-chip">{sound.license}</span>
                  </div>
                  <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--muted)]">
                    <span>Freesound · {sound.author}</span>
                    <span className="inline-flex items-center gap-1">
                      <Clock3 size={13} /> {formatDuration(sound.duration)}
                    </span>
                  </p>
                  {sound.tags.length > 0 && (
                    <p className="mt-2 line-clamp-1 text-xs text-[var(--muted)]">
                      {sound.tags.join(' · ')}
                    </p>
                  )}
                </div>
                <div className="mt-4 sm:mt-0">
                  <audio
                    controls
                    preload="none"
                    src={sound.previewUrl}
                    className="h-10 w-full"
                    aria-label={`试听 ${sound.title}`}
                  />
                  <div className="mt-2 flex justify-end gap-4 text-xs font-semibold">
                    <a
                      href={sound.licenseUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="hover:underline"
                    >
                      查看授权
                    </a>
                    <a
                      href={sound.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-[var(--primary-ink)] hover:underline"
                    >
                      来源与下载 <ArrowUpRight size={13} />
                    </a>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      ) : result ? (
        <div className="mt-8 rounded-xl bg-[var(--surface)] p-6 text-sm text-[var(--muted)]">
          没有找到合适的可商用候选音效，请尝试更具体的英文词，例如“soft whoosh”或“city ambience”。
        </div>
      ) : (
        <div className="mt-10 grid min-h-64 place-items-center text-center">
          <div className="max-w-md">
            <AudioLines size={28} className="mx-auto text-[var(--muted)]" />
            <h2 className="mt-4 font-semibold">从声音描述开始</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
              文案拆解中的音效建议也会直接带你来到这里，并自动填写搜索词。
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
