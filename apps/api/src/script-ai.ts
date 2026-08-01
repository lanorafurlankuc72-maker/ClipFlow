export interface VoiceoverSegment {
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

export interface SoundEffectSuggestion {
  type: 'ambient' | 'action' | 'transition';
  label: string;
  searchQuery: string;
}

export interface VoiceoverAnalysis {
  usedAi: true;
  provider: 'deepseek';
  segments: VoiceoverSegment[];
  totalDuration: number;
  overallEmotion: string;
  arc: string;
}

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string } }>;
}

function readString(value: unknown, fallback: string, maxLength = 300) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, maxLength) : fallback;
}

function normalizeSegment(value: unknown): VoiceoverSegment | null {
  if (!value || typeof value !== 'object') return null;
  const segment = value as Record<string, unknown>;
  const narration = readString(segment.narration, '', 600);
  if (!narration) return null;
  const rawDuration =
    typeof segment.duration === 'number' ? segment.duration : Number(segment.duration);
  const rawEnergy = typeof segment.energy === 'number' ? segment.energy : Number(segment.energy);
  const keywords = Array.isArray(segment.keywords)
    ? segment.keywords
        .filter((item): item is string => typeof item === 'string' && Boolean(item.trim()))
        .map((item) => item.trim().slice(0, 30))
        .slice(0, 6)
    : [];
  const soundEffects = Array.isArray(segment.soundEffects)
    ? segment.soundEffects
        .flatMap((item): SoundEffectSuggestion[] => {
          if (!item || typeof item !== 'object') return [];
          const suggestion = item as Record<string, unknown>;
          const type = suggestion.type;
          if (type !== 'ambient' && type !== 'action' && type !== 'transition') return [];
          const label = readString(suggestion.label, '', 40);
          const searchQuery = readString(suggestion.searchQuery, '', 120);
          return label && searchQuery ? [{ type, label, searchQuery }] : [];
        })
        .slice(0, 3)
    : [];
  return {
    narration,
    duration: Number.isFinite(rawDuration) ? Math.max(2, Math.min(20, Math.round(rawDuration))) : 5,
    emotion: readString(segment.emotion, '平稳', 20),
    energy: Number.isFinite(rawEnergy) ? Math.max(1, Math.min(5, Math.round(rawEnergy))) : 3,
    shotType: readString(segment.shotType, '情境中景', 30),
    visualSuggestion: readString(
      segment.visualSuggestion,
      '选择与口播语义一致的人物或环境画面，保持自然运镜',
      240,
    ),
    keywords: keywords.length ? keywords : ['人物情境', '自然运镜', '电影感'],
    searchQuery: readString(
      segment.searchQuery,
      'cinematic lifestyle person natural movement',
      180,
    ),
    soundEffects: soundEffects.length
      ? soundEffects
      : [{ type: 'ambient', label: '环境底噪', searchQuery: 'natural room tone ambience' }],
  };
}

export async function analyzeVoiceoverWithDeepSeek(
  script: string,
): Promise<VoiceoverAnalysis | null> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey || process.env.AI_PROVIDER?.toLowerCase() !== 'deepseek') return null;

  const model = process.env.DEEPSEEK_MODEL ?? 'deepseek-v4-flash';
  try {
    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0.25,
        thinking: { type: 'disabled' },
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              '你是资深短视频剪辑与声音设计策划。把中文口播文案拆成连续、可执行的分镜。必须返回严格 JSON，不要 Markdown。分镜要覆盖全部原文，不得改写或遗漏口播。每个分镜应包含：narration 原文片段；duration 预计秒数；emotion 中文情绪；energy 1到5；shotType 中文景别；visualSuggestion 具体可拍画面；keywords 3到6个中文素材词；searchQuery 适合 Pexels/Pixabay 的具体英文搜索短语；soundEffects 1到3个音效建议，每项格式为 {"type":"ambient|action|transition","label":"中文名称","searchQuery":"适合 Freesound 的具体英文短语"}。音效要与画面动作、空间环境和分镜衔接对应，避免每段机械重复同一种音效。还要返回 overallEmotion 中文主要情绪和 arc 中文情绪走势。格式：{"segments":[...],"overallEmotion":"","arc":""}。分镜数量控制在 3 到 16 个，避免抽象空话，优先人物、动作、场景、光线、镜头运动及可听见的真实声音。',
          },
          { role: 'user', content: script },
        ],
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`DeepSeek request failed: ${response.status}`);
    const payload = (await response.json()) as ChatCompletionResponse;
    const content = payload.choices?.[0]?.message?.content ?? '';
    const jsonText = content.match(/\{[\s\S]*\}/)?.[0];
    if (!jsonText) throw new Error('DeepSeek response did not contain JSON');
    const parsed = JSON.parse(jsonText) as Record<string, unknown>;
    const segments = Array.isArray(parsed.segments)
      ? parsed.segments
          .map(normalizeSegment)
          .filter((item): item is VoiceoverSegment => Boolean(item))
          .slice(0, 16)
      : [];
    if (!segments.length) throw new Error('DeepSeek response did not contain segments');
    return {
      usedAi: true,
      provider: 'deepseek',
      segments,
      totalDuration: segments.reduce((sum, segment) => sum + segment.duration, 0),
      overallEmotion: readString(parsed.overallEmotion, '平稳', 30),
      arc: readString(parsed.arc, '稳定推进', 40),
    };
  } catch {
    return null;
  }
}
