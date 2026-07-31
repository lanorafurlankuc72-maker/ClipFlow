import { fetchJson, safeTitle } from '../http.js';
import type { Asset, SearchProvider, SearchRequest } from '../types.js';

interface UnsplashResponse {
  results: Array<{
    id: string;
    width: number;
    height: number;
    alt_description: string | null;
    description: string | null;
    links: { html: string; download_location: string };
    urls: { small: string; regular: string; full: string };
    user: { name: string; links: { html: string } };
  }>;
}

export class UnsplashProvider implements SearchProvider {
  readonly name = 'unsplash' as const;
  readonly supportedTypes = ['image'] as const;

  constructor(private readonly accessKey = process.env.UNSPLASH_ACCESS_KEY) {}

  isConfigured(): boolean {
    return Boolean(this.accessKey);
  }

  async search(request: SearchRequest): Promise<Asset[]> {
    if (!this.accessKey || (request.type !== 'all' && request.type !== 'image')) return [];
    const url = new URL('https://api.unsplash.com/search/photos');
    url.search = new URLSearchParams({
      query: request.query,
      page: String(request.page),
      per_page: String(request.perPage),
      content_filter: 'high',
      client_id: this.accessKey,
    }).toString();
    const data = await fetchJson<UnsplashResponse>(url, { signal: request.signal });
    return data.results.map((image) => ({
      id: `unsplash-image-${image.id}`,
      provider: this.name,
      type: 'image',
      title: safeTitle(image.description ?? image.alt_description, `Unsplash 图片 ${image.id}`),
      width: image.width,
      height: image.height,
      thumbnailUrl: image.urls.small,
      previewUrl: image.urls.regular,
      contentUrl: image.urls.full,
      sourceUrl: image.links.html,
      author: { name: image.user.name, url: image.user.links.html },
    }));
  }
}
