import type { SearchAssetType } from '@clipflow/providers';

export interface SearchAnalysis {
  usedAi: boolean;
  provider: 'openai' | 'deepseek' | null;
  searchQuery: string;
  keywords: string[];
  searchQueries: string[];
}

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string } }>;
}

function resolveProvider(): 'openai' | 'deepseek' | null {
  const configured = process.env.AI_PROVIDER?.toLowerCase();
  if (configured === 'openai' && process.env.OPENAI_API_KEY) return 'openai';
  if (configured === 'deepseek' && process.env.DEEPSEEK_API_KEY) return 'deepseek';
  return null;
}

export async function analyzeSearchQuery(
  query: string,
  type: SearchAssetType,
): Promise<SearchAnalysis> {
  const provider = resolveProvider();
  if (!provider)
    return {
      usedAi: false,
      provider: null,
      searchQuery: query,
      keywords: [],
      searchQueries: createQueryVariants(query, []),
    };

  const isOpenAi = provider === 'openai';
  const apiKey = isOpenAi ? process.env.OPENAI_API_KEY : process.env.DEEPSEEK_API_KEY;
  const model = isOpenAi
    ? (process.env.OPENAI_MODEL ?? 'gpt-4o-mini')
    : (process.env.DEEPSEEK_MODEL ?? 'deepseek-chat');
  const endpoint = isOpenAi
    ? 'https://api.openai.com/v1/chat/completions'
    : 'https://api.deepseek.com/chat/completions';

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        messages: [
          {
            role: 'system',
            content:
              'You turn a Chinese or English creative brief into concise English stock-media search keywords. Return JSON only: {"searchQuery":"...","keywords":["..."]}. Use 3-8 concrete visual concepts and no explanations.',
          },
          { role: 'user', content: `Media type: ${type}. Brief: ${query}` },
        ],
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error(`AI request failed: ${response.status}`);
    const payload = (await response.json()) as ChatCompletionResponse;
    const content = payload.choices?.[0]?.message?.content ?? '';
    const jsonText = content.match(/\{[\s\S]*\}/)?.[0];
    if (!jsonText) throw new Error('AI response did not contain JSON');
    const parsed = JSON.parse(jsonText) as { searchQuery?: unknown; keywords?: unknown };
    const searchQuery =
      typeof parsed.searchQuery === 'string' && parsed.searchQuery.trim()
        ? parsed.searchQuery.trim()
        : query;
    const keywords = Array.isArray(parsed.keywords)
      ? parsed.keywords.filter((item): item is string => typeof item === 'string').slice(0, 8)
      : [];
    return {
      usedAi: true,
      provider,
      searchQuery,
      keywords,
      searchQueries: createQueryVariants(searchQuery, keywords),
    };
  } catch {
    return {
      usedAi: false,
      provider: null,
      searchQuery: query,
      keywords: [],
      searchQueries: createQueryVariants(query, []),
    };
  }
}

function createQueryVariants(searchQuery: string, keywords: string[]): string[] {
  const normalized = searchQuery.trim();
  const groups = normalized
    .split(/[,，;；|/]+/)
    .map((value) => value.trim())
    .filter((value) => value.length >= 2);
  const keywordVariants = keywords
    .map((value) => value.trim())
    .filter((value) => value.length >= 2)
    .slice(0, 2);
  return [...new Set([normalized, ...groups, ...keywordVariants])].slice(0, 3);
}
