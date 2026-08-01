export interface SoundEffect {
  id: string;
  title: string;
  description: string;
  duration: number;
  previewUrl: string;
  waveformUrl?: string;
  sourceUrl: string;
  author: string;
  license: 'CC0' | 'CC BY';
  licenseUrl: string;
  tags: string[];
  provider: 'freesound';
}

export interface SoundSearchResult {
  configured: boolean;
  query: string;
  page: number;
  total: number;
  hasMore: boolean;
  sounds: SoundEffect[];
}

interface FreesoundItem {
  id?: number;
  name?: string;
  description?: string;
  duration?: number;
  username?: string;
  license?: string;
  url?: string;
  tags?: string[];
  previews?: Record<string, string>;
  images?: Record<string, string>;
}

interface FreesoundResponse {
  count?: number;
  next?: string | null;
  results?: FreesoundItem[];
}

function normalizeLicense(
  value: string | undefined,
): Pick<SoundEffect, 'license' | 'licenseUrl'> | null {
  if (value === 'Creative Commons 0') {
    return { license: 'CC0', licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/' };
  }
  if (value === 'Attribution') {
    return { license: 'CC BY', licenseUrl: 'https://creativecommons.org/licenses/by/4.0/' };
  }
  return null;
}

export async function searchSoundEffects(
  query: string,
  page: number,
  perPage: number,
): Promise<SoundSearchResult> {
  const apiKey = process.env.FREESOUND_API_KEY;
  if (!apiKey) {
    return { configured: false, query, page, total: 0, hasMore: false, sounds: [] };
  }

  const params = new URLSearchParams({
    query,
    page: String(page),
    page_size: String(perPage),
    sort: 'score',
    filter: 'license:("Creative Commons 0" OR "Attribution")',
    fields: 'id,name,description,duration,username,license,url,tags,previews,images',
  });
  const response = await fetch(`https://freesound.org/apiv2/search/?${params}`, {
    headers: { Authorization: `Token ${apiKey}` },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`Freesound request failed: ${response.status}`);
  const payload = (await response.json()) as FreesoundResponse;
  const sounds = (payload.results ?? []).flatMap((item): SoundEffect[] => {
    const license = normalizeLicense(item.license);
    const previewUrl = item.previews?.['preview-hq-mp3'] ?? item.previews?.['preview-lq-mp3'];
    if (!license || !item.id || !previewUrl) return [];
    return [
      {
        id: `freesound-${item.id}`,
        title: item.name?.trim() || `Sound ${item.id}`,
        description:
          item.description
            ?.replace(/<[^>]*>/g, '')
            .trim()
            .slice(0, 360) ?? '',
        duration: Math.max(0, Number(item.duration) || 0),
        previewUrl,
        waveformUrl: item.images?.waveform_m,
        sourceUrl: item.url ?? `https://freesound.org/s/${item.id}/`,
        author: item.username?.trim() || 'Freesound contributor',
        tags: (item.tags ?? []).slice(0, 6),
        provider: 'freesound',
        ...license,
      },
    ];
  });
  return {
    configured: true,
    query,
    page,
    total: Math.max(sounds.length, Number(payload.count) || 0),
    hasMore: Boolean(payload.next),
    sounds,
  };
}
