'use client';

import {
  ArrowRight,
  BarChart3,
  Film,
  Image as ImageIcon,
  LoaderCircle,
  Search,
  Sparkles,
  Volume2,
  WandSparkles,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { SearchAssetType } from '@clipflow/providers';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ScriptWorkspaceProps {
  onSearch: (query: string, type: SearchAssetType) => void;
  onSoundSearch: (query: string) => void;
}

interface SoundEffectSuggestion {
  type: 'ambient' | 'action' | 'transition';
  label: string;
  searchQuery: string;
}

interface ScriptSegment {
  id: number;
  narration: string;
  duration: number;
  emotion: string;
  energy: number;
  shotType: string;
  visualSuggestion: string;
  keywords: string[];
  searchQuery: string;
  soundEffects: SoundEffectSuggestion[];
}

interface ScriptAnalysis {
  usedAi: boolean;
  provider: 'deepseek' | null;
  segments: ScriptSegment[];
  totalDuration: number;
  overallEmotion: string;
  arc: string;
}

const SAMPLE_SCRIPT =
  '每一个清晨，都是新的开始。一杯咖啡的温度，让城市在节奏中苏醒。我们穿过忙碌的街道，也为心里的目标留出方向。真正的改变，往往始于一次勇敢的出发。';
const SCRIPT_STORAGE_KEY = 'clipflow-voiceover-script';
const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  (process.env.NODE_ENV === 'production'
    ? 'https://clipflow-api-wgrg.onrender.com'
    : 'http://localhost:4000');

const visualRules = [
  {
    test: /清晨|早晨|日出|阳光|醒来/,
    keywords: ['清晨', '阳光', '城市街道'],
    query: 'cinematic city street sunrise morning',
    visual: '清晨阳光洒在城市街道，空镜缓慢推进',
    shot: '全景空镜',
  },
  {
    test: /咖啡|早餐|杯|温度|餐厅/,
    keywords: ['咖啡特写', '手部动作', '暖色光'],
    query: 'coffee close up warm cafe hands cinematic',
    visual: '咖啡液体与杯口蒸汽特写，手部自然入画',
    shot: '细节特写',
  },
  {
    test: /城市|街道|通勤|忙碌|人群|节奏/,
    keywords: ['城市人群', '通勤', '延时摄影'],
    query: 'busy city commuters street timelapse cinematic',
    visual: '通勤人群穿行城市路口，快切或延时摄影',
    shot: '中远景',
  },
  {
    test: /科技|产品|智能|数据|未来|创新/,
    keywords: ['科技产品', '屏幕操作', '现代空间'],
    query: 'modern technology product interface cinematic',
    visual: '产品操作细节与现代空间交替，突出科技质感',
    shot: '产品特写',
  },
  {
    test: /旅行|出发|远方|道路|探索|世界/,
    keywords: ['公路旅行', '远方', '人物背影'],
    query: 'traveler road journey wide shot cinematic',
    visual: '人物走向远方或车辆驶过公路，画面逐渐开阔',
    shot: '跟拍远景',
  },
  {
    test: /目标|成长|改变|坚持|勇敢|成功|突破/,
    keywords: ['坚定人物', '向前行走', '高光时刻'],
    query: 'confident person walking forward inspiring cinematic',
    visual: '人物坚定向前，逆光轮廓配合轻微升格',
    shot: '人物中景',
  },
  {
    test: /自然|森林|山|海|风|自由|平静/,
    keywords: ['自然风景', '风吹细节', '舒缓运镜'],
    query: 'peaceful nature landscape wind cinematic slow motion',
    visual: '自然环境空镜与风吹细节，运镜舒缓',
    shot: '自然空镜',
  },
];

const soundRules: Array<{
  test: RegExp;
  sounds: SoundEffectSuggestion[];
}> = [
  {
    test: /清晨|早晨|日出|阳光|醒来/,
    sounds: [
      { type: 'ambient', label: '清晨城市环境', searchQuery: 'morning city ambience birds' },
      { type: 'transition', label: '轻柔渐入', searchQuery: 'soft airy whoosh transition' },
    ],
  },
  {
    test: /咖啡|早餐|杯|温度|餐厅/,
    sounds: [
      { type: 'action', label: '咖啡冲煮声', searchQuery: 'coffee machine brewing' },
      { type: 'action', label: '杯具轻碰', searchQuery: 'ceramic cup clink' },
      { type: 'ambient', label: '咖啡馆环境', searchQuery: 'quiet cafe ambience' },
    ],
  },
  {
    test: /城市|街道|通勤|忙碌|人群|节奏/,
    sounds: [
      { type: 'ambient', label: '城市交通环境', searchQuery: 'busy city traffic ambience' },
      { type: 'action', label: '人群脚步声', searchQuery: 'crowd footsteps street' },
    ],
  },
  {
    test: /科技|产品|智能|数据|未来|创新/,
    sounds: [
      { type: 'action', label: '界面点击声', searchQuery: 'clean digital interface click' },
      { type: 'transition', label: '科技转场', searchQuery: 'futuristic digital whoosh' },
    ],
  },
  {
    test: /旅行|出发|远方|道路|探索|世界/,
    sounds: [
      { type: 'ambient', label: '旷野风声', searchQuery: 'open landscape gentle wind ambience' },
      { type: 'action', label: '车辆驶过', searchQuery: 'car pass by road' },
      { type: 'transition', label: '电影感转场', searchQuery: 'cinematic whoosh transition' },
    ],
  },
  {
    test: /自然|森林|山|海|风|自由|平静/,
    sounds: [
      { type: 'ambient', label: '自然环境声', searchQuery: 'peaceful nature ambience wind birds' },
      { type: 'ambient', label: '树叶风声', searchQuery: 'leaves rustling gentle wind' },
    ],
  },
];

function splitScript(value: string): string[] {
  const sentences = value
    .replace(/\r/g, '')
    .split(/(?<=[。！？!?；;])|\n+/)
    .map((item) => item.trim())
    .filter(Boolean);
  const segments: string[] = [];
  for (const sentence of sentences) {
    if (sentence.length > 54) {
      const clauses = sentence.split(/(?<=[，,、：:])/).map((item) => item.trim());
      segments.push(...clauses.filter(Boolean));
    } else if (sentence.length < 10 && segments.length) {
      segments[segments.length - 1] += sentence;
    } else {
      segments.push(sentence);
    }
  }
  return segments.slice(0, 16);
}

function detectEmotion(text: string) {
  if (/勇敢|突破|成功|目标|坚持|改变|出发|力量/.test(text)) return { emotion: '振奋', energy: 5 };
  if (/快乐|笑|美好|惊喜|热爱|活力/.test(text)) return { emotion: '愉悦', energy: 4 };
  if (/忙碌|节奏|速度|追赶|竞争/.test(text)) return { emotion: '紧凑', energy: 4 };
  if (/孤独|遗憾|失去|难过|离开/.test(text)) return { emotion: '低沉', energy: 2 };
  if (/平静|自然|温柔|清晨|阳光|咖啡|治愈/.test(text)) return { emotion: '温暖', energy: 3 };
  return { emotion: '平稳', energy: 3 };
}

function analyzeScript(value: string): ScriptAnalysis {
  const segments = splitScript(value).map((narration, index): ScriptSegment => {
    const matched = visualRules.find((rule) => rule.test.test(narration));
    const soundMatched = soundRules.find((rule) => rule.test.test(narration));
    const mood = detectEmotion(narration);
    return {
      id: index + 1,
      narration,
      duration: Math.max(3, Math.min(12, Math.ceil(narration.replace(/\s/g, '').length / 4.2))),
      emotion: mood.emotion,
      energy: mood.energy,
      shotType: matched?.shot ?? '情境中景',
      visualSuggestion: matched?.visual ?? '选择与口播语义一致的人物或环境画面，保持自然运镜',
      keywords: matched?.keywords ?? ['人物情境', '自然运镜', '电影感'],
      searchQuery: matched?.query ?? 'cinematic lifestyle person natural movement',
      soundEffects: soundMatched?.sounds ?? [
        { type: 'ambient', label: '自然环境底噪', searchQuery: 'natural room tone ambience' },
        { type: 'transition', label: '柔和转场', searchQuery: 'soft whoosh transition' },
      ],
    };
  });
  const totalDuration = segments.reduce((sum, segment) => sum + segment.duration, 0);
  const emotionCounts = new Map<string, number>();
  segments.forEach((segment) =>
    emotionCounts.set(segment.emotion, (emotionCounts.get(segment.emotion) ?? 0) + 1),
  );
  const overallEmotion = [...emotionCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '平稳';
  const first = segments[0]?.energy ?? 3;
  const last = segments.at(-1)?.energy ?? 3;
  const arc = last > first ? '渐进上扬' : last < first ? '由强转缓' : '稳定推进';
  return { usedAi: false, provider: null, segments, totalDuration, overallEmotion, arc };
}

function EmotionCurve({ segments }: { segments: ScriptSegment[] }) {
  const width = 320;
  const height = 128;
  const points = segments
    .map((segment, index) => {
      const x =
        segments.length === 1 ? width / 2 : 18 + (index / (segments.length - 1)) * (width - 36);
      const y = height - 18 - ((segment.energy - 1) / 4) * (height - 40);
      return `${x},${y}`;
    })
    .join(' ');
  return (
    <div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-32 w-full"
        role="img"
        aria-label={`情绪曲线，共 ${segments.length} 个分镜`}
      >
        {[28, 62, 96].map((y) => (
          <line key={y} x1="18" x2="302" y1={y} y2={y} stroke="var(--line)" strokeDasharray="4 5" />
        ))}
        <polyline
          points={points}
          fill="none"
          stroke="var(--primary)"
          strokeWidth="3"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {segments.map((segment, index) => {
          const x =
            segments.length === 1 ? width / 2 : 18 + (index / (segments.length - 1)) * (width - 36);
          const y = height - 18 - ((segment.energy - 1) / 4) * (height - 40);
          return (
            <circle
              key={segment.id}
              cx={x}
              cy={y}
              r="4"
              fill="white"
              stroke="var(--primary)"
              strokeWidth="3"
            />
          );
        })}
      </svg>
      <div className="flex justify-between px-1 text-xs text-[var(--muted)]">
        {segments.map((segment) => (
          <span key={segment.id}>S{segment.id}</span>
        ))}
      </div>
    </div>
  );
}

export function ScriptWorkspace({ onSearch, onSoundSearch }: ScriptWorkspaceProps) {
  const [script, setScript] = useState(() => {
    if (typeof window === 'undefined') return '';
    return window.localStorage.getItem(SCRIPT_STORAGE_KEY) ?? '';
  });
  const [analysis, setAnalysis] = useState<ScriptAnalysis | null>(() => {
    if (typeof window === 'undefined') return null;
    const saved = window.localStorage.getItem(SCRIPT_STORAGE_KEY) ?? '';
    return saved.trim().length >= 8 ? analyzeScript(saved) : null;
  });
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [activeId, setActiveId] = useState(1);
  const activeSegment = useMemo(
    () => analysis?.segments.find((segment) => segment.id === activeId) ?? analysis?.segments[0],
    [activeId, analysis],
  );

  useEffect(() => {
    window.localStorage.setItem(SCRIPT_STORAGE_KEY, script);
  }, [script]);

  async function runAnalysis() {
    setIsAnalyzing(true);
    try {
      const response = await fetch(`${API_BASE_URL}/script/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ script }),
      });
      if (!response.ok) throw new Error('AI analysis unavailable');
      const payload = (await response.json()) as Omit<ScriptAnalysis, 'segments'> & {
        segments: Array<Omit<ScriptSegment, 'id'>>;
      };
      const next: ScriptAnalysis = {
        ...payload,
        segments: payload.segments.map((segment, index) => ({
          ...segment,
          id: index + 1,
          soundEffects:
            segment.soundEffects?.length > 0
              ? segment.soundEffects
              : [
                  {
                    type: 'ambient',
                    label: '自然环境底噪',
                    searchQuery: 'natural room tone ambience',
                  },
                ],
        })),
      };
      setAnalysis(next);
      setActiveId(next.segments[0]?.id ?? 1);
    } catch {
      const next = analyzeScript(script);
      setAnalysis(next);
      setActiveId(next.segments[0]?.id ?? 1);
    } finally {
      setIsAnalyzing(false);
    }
  }

  return (
    <section
      className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 lg:px-10 lg:py-10"
      aria-labelledby="script-title"
    >
      <div className="mb-6 flex flex-col gap-3 border-b border-[var(--line)] pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-[var(--primary-ink)]">剪辑前策划</p>
          <h1 id="script-title" className="mt-1 text-2xl font-bold tracking-[-0.025em]">
            口播文案拆解
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">
            把完整口播拆成可执行分镜，并为每段生成画面方向和素材搜索词。
          </p>
        </div>
        {analysis && (
          <div className="flex flex-wrap gap-2 text-sm">
            <span className="provider-chip">{analysis.segments.length} 个分镜</span>
            <span className="provider-chip">约 {analysis.totalDuration} 秒</span>
            <span className="provider-chip">
              {analysis.overallEmotion} · {analysis.arc}
            </span>
            <span className="provider-chip">{analysis.usedAi ? 'DeepSeek AI' : '本地分析'}</span>
          </div>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border border-[var(--line)] bg-white lg:grid lg:min-h-[680px] lg:grid-cols-[300px_minmax(0,1fr)] xl:grid-cols-[320px_minmax(460px,1fr)_320px]">
        <div className="border-b border-[var(--line)] p-5 lg:border-b-0 lg:border-r">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-bold">文案内容</h2>
            <button
              type="button"
              className="text-sm font-semibold text-[var(--primary-ink)] hover:underline focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[var(--focus)]"
              onClick={() => setScript(SAMPLE_SCRIPT)}
            >
              填入示例
            </button>
          </div>
          <label htmlFor="voiceover-script" className="sr-only">
            口播文案
          </label>
          <textarea
            id="voiceover-script"
            value={script}
            maxLength={5000}
            onChange={(event) => setScript(event.target.value)}
            placeholder="粘贴口播文案，例如：每一个清晨，都是新的开始……"
            className="mt-4 min-h-80 w-full resize-y rounded-lg border border-[var(--line)] bg-[var(--bg)] p-4 text-base leading-7 outline-none transition focus:border-[var(--primary)] focus:ring-3 focus:ring-[var(--focus)] lg:min-h-[500px]"
          />
          <div className="mt-3 flex items-center justify-between text-xs text-[var(--muted)]">
            <span>建议 50–1200 字</span>
            <span>{script.length} / 5000</span>
          </div>
          <Button
            className="mt-4 w-full"
            size="lg"
            disabled={script.trim().length < 8 || isAnalyzing}
            onClick={() => void runAnalysis()}
          >
            {isAnalyzing ? (
              <LoaderCircle className="animate-spin" size={18} />
            ) : (
              <WandSparkles size={18} />
            )}
            {isAnalyzing ? 'DeepSeek 分析中…' : '拆解文案'}
          </Button>
        </div>

        <div className="border-b border-[var(--line)] p-5 lg:border-b-0 lg:p-6 xl:border-r">
          <div className="flex items-center justify-between gap-4">
            <h2 className="font-bold">分镜与素材建议</h2>
            <span className="text-sm text-[var(--muted)]">点击分镜查看详情</span>
          </div>
          {analysis ? (
            <div className="mt-4 divide-y divide-[var(--line)] border-y border-[var(--line)]">
              {analysis.segments.map((segment) => (
                <article
                  key={segment.id}
                  className={cn(
                    'py-5 transition-colors',
                    activeSegment?.id === segment.id && 'bg-[var(--primary-soft)]/45',
                  )}
                >
                  <button
                    type="button"
                    className="w-full px-3 text-left focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[var(--focus)]"
                    onClick={() => setActiveId(segment.id)}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-bold text-[var(--primary-ink)]">
                        S{segment.id}
                      </span>
                      <span className="text-xs tabular-nums text-[var(--muted)]">
                        {segment.duration} 秒
                      </span>
                    </div>
                    <p className="mt-2 font-semibold leading-6">“{segment.narration}”</p>
                    <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                      {segment.visualSuggestion}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <span className="provider-chip">{segment.shotType}</span>
                      <span className="provider-chip">{segment.emotion}</span>
                      {segment.keywords.map((keyword) => (
                        <span key={keyword} className="provider-chip">
                          {keyword}
                        </span>
                      ))}
                    </div>
                  </button>
                  <div className="mt-4 flex flex-wrap gap-2 px-3">
                    <Button type="button" onClick={() => onSearch(segment.searchQuery, 'video')}>
                      <Film size={16} /> 搜索视频
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => onSearch(segment.searchQuery, 'image')}
                    >
                      <ImageIcon size={16} /> 搜索图片
                    </Button>
                  </div>
                  <div className="mt-3 px-3">
                    <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-[var(--muted)]">
                      <Volume2 size={14} /> 音效建议
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {segment.soundEffects.map((sound) => (
                        <button
                          key={`${sound.type}-${sound.searchQuery}`}
                          type="button"
                          onClick={() => onSoundSearch(sound.searchQuery)}
                          className="provider-chip min-h-9 cursor-pointer border border-transparent transition hover:border-[var(--primary)] hover:text-[var(--primary-ink)] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[var(--focus)]"
                          title={`搜索：${sound.searchQuery}`}
                        >
                          {sound.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="grid min-h-[480px] place-items-center text-center">
              <div className="max-w-sm">
                <div className="mx-auto grid size-12 place-items-center rounded-xl bg-[var(--primary-soft)] text-[var(--primary-ink)]">
                  <Sparkles size={22} />
                </div>
                <h3 className="mt-4 font-semibold">还没有分镜</h3>
                <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                  粘贴口播文案并点击“拆解文案”，这里会按语义生成镜头建议。
                </p>
              </div>
            </div>
          )}
        </div>

        <aside
          className="p-5 lg:col-span-2 lg:border-t lg:border-[var(--line)] lg:p-6 xl:col-span-1 xl:border-t-0"
          aria-label="情绪分析"
        >
          <div className="flex items-center gap-2">
            <BarChart3 size={18} className="text-[var(--primary-ink)]" />
            <h2 className="font-bold">整片情绪</h2>
          </div>
          {analysis ? (
            <>
              <div className="mt-5">
                <EmotionCurve segments={analysis.segments} />
              </div>
              <dl className="mt-6 divide-y divide-[var(--line)] border-y border-[var(--line)] text-sm">
                <div className="flex items-center justify-between py-3">
                  <dt className="text-[var(--muted)]">主要情绪</dt>
                  <dd className="font-semibold">{analysis.overallEmotion}</dd>
                </div>
                <div className="flex items-center justify-between py-3">
                  <dt className="text-[var(--muted)]">情绪走向</dt>
                  <dd className="font-semibold">{analysis.arc}</dd>
                </div>
                <div className="flex items-center justify-between py-3">
                  <dt className="text-[var(--muted)]">预计时长</dt>
                  <dd className="font-semibold">{analysis.totalDuration} 秒</dd>
                </div>
              </dl>
              {activeSegment && (
                <div className="mt-6 rounded-lg bg-[var(--surface)] p-4">
                  <p className="text-xs font-semibold text-[var(--muted)]">
                    当前分镜 S{activeSegment.id}
                  </p>
                  <p className="mt-2 font-semibold">
                    {activeSegment.emotion} · 强度 {activeSegment.energy}/5
                  </p>
                  <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                    {activeSegment.visualSuggestion}
                  </p>
                  <button
                    type="button"
                    onClick={() => onSearch(activeSegment.searchQuery, 'video')}
                    className="mt-4 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[var(--primary-ink)] hover:underline focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[var(--focus)]"
                  >
                    查看匹配素材 <ArrowRight size={16} />
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="mt-5 rounded-lg bg-[var(--surface)] p-4 text-sm leading-6 text-[var(--muted)]">
              拆解完成后，这里会显示整条视频的情绪曲线、主要情绪和节奏走向。
            </div>
          )}
          <div className="mt-6 border-t border-[var(--line)] pt-5">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Search size={16} /> 搜索说明
            </div>
            <p className="mt-2 text-xs leading-5 text-[var(--muted)]">
              搜索词已转换为适合素材平台的具体英文画面描述，可直接查询现有素材库。
            </p>
          </div>
        </aside>
      </div>
    </section>
  );
}
