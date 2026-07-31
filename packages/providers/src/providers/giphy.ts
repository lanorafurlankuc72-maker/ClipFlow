import { fetchJson, safeTitle } from '../http.js';
import type { Asset, SearchProvider, SearchRequest } from '../types.js';

interface GiphyResponse {
  data: Array<{
    id: string;
    title: string;
    url: string;
    username: string;
    user?: { display_name: string; profile_url: string };
    images: {
      fixed_width: { url: string; width: string; height: string };
      original: { url: string; width: string; height: string };
    };
  }>;
}

export class GiphyProvider implements SearchProvider {
  readonly name = 'giphy' as const;
  readonly supportedTypes = ['gif'] as const;

  constructor(private readonly apiKey = process.env.GIPHY_API_KEY) {}

  isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  async search(request: SearchRequest): Promise<Asset[]> {
    if (!this.apiKey || (request.type !== 'all' && request.type !== 'gif')) return [];
    const url = new URL('https://api.giphy.com/v1/gifs/search');
    url.search = new URLSearchParams({
      api_key: this.apiKey,
      q: request.query,
      limit: String(request.perPage),
      offset: String((request.page - 1) * request.perPage),
      rating: 'g',
      lang: 'zh-CN',
    }).toString();
    const data = await fetchJson<GiphyResponse>(url, { signal: request.signal });
    return data.data.map((gif) => ({
      id: `giphy-gif-${gif.id}`,
      provider: this.name,
      type: 'gif',
      title: safeTitle(gif.title, `GIPHY 动图 ${gif.id}`),
      width: Number(gif.images.original.width),
      height: Number(gif.images.original.height),
      thumbnailUrl: gif.images.fixed_width.url,
      previewUrl: gif.images.original.url,
      contentUrl: gif.images.original.url,
      sourceUrl: gif.url,
      author: {
        name: gif.user?.display_name || gif.username || 'GIPHY',
        url: gif.user?.profile_url,
      },
    }));
  }
}
