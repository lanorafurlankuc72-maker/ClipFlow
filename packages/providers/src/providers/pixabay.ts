import { fetchJson, safeTitle } from '../http.js';
import type { Asset, SearchProvider, SearchRequest } from '../types.js';

interface PixabayImageResponse {
  hits: Array<{
    id: number;
    tags: string;
    pageURL: string;
    user: string;
    userImageURL: string;
    imageWidth: number;
    imageHeight: number;
    webformatURL: string;
    largeImageURL: string;
  }>;
}

interface PixabayVideoResponse {
  hits: Array<{
    id: number;
    tags: string;
    pageURL: string;
    user: string;
    duration: number;
    videos: Record<string, { url: string; width: number; height: number; thumbnail: string }>;
  }>;
}

export class PixabayProvider implements SearchProvider {
  readonly name = 'pixabay' as const;
  readonly supportedTypes = ['image', 'video'] as const;

  constructor(private readonly apiKey = process.env.PIXABAY_API_KEY) {}

  isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  async search(request: SearchRequest): Promise<Asset[]> {
    if (!this.apiKey) return [];
    const searches: Promise<Asset[]>[] = [];
    if (request.type === 'all' || request.type === 'image')
      searches.push(this.searchImages(request));
    if (request.type === 'all' || request.type === 'video')
      searches.push(this.searchVideos(request));
    return (await Promise.all(searches)).flat();
  }

  private params(request: SearchRequest): URLSearchParams {
    return new URLSearchParams({
      key: this.apiKey ?? '',
      q: request.query,
      page: String(request.page),
      per_page: String(Math.max(3, request.perPage)),
      safesearch: 'true',
    });
  }

  private async searchImages(request: SearchRequest): Promise<Asset[]> {
    const url = new URL('https://pixabay.com/api/');
    url.search = this.params(request).toString();
    const data = await fetchJson<PixabayImageResponse>(url, { signal: request.signal });
    return data.hits.map((image) => ({
      id: `pixabay-image-${image.id}`,
      provider: this.name,
      type: 'image',
      title: safeTitle(image.tags, `Pixabay 图片 ${image.id}`),
      width: image.imageWidth,
      height: image.imageHeight,
      thumbnailUrl: image.webformatURL,
      previewUrl: image.largeImageURL,
      contentUrl: image.largeImageURL,
      sourceUrl: image.pageURL,
      author: { name: image.user },
    }));
  }

  private async searchVideos(request: SearchRequest): Promise<Asset[]> {
    const url = new URL('https://pixabay.com/api/videos/');
    url.search = this.params(request).toString();
    const data = await fetchJson<PixabayVideoResponse>(url, { signal: request.signal });
    return data.hits.flatMap((video) => {
      const file = video.videos.large ?? video.videos.medium ?? video.videos.small;
      if (!file) return [];
      return [
        {
          id: `pixabay-video-${video.id}`,
          provider: this.name,
          type: 'video' as const,
          title: safeTitle(video.tags, `Pixabay 视频 ${video.id}`),
          width: file.width,
          height: file.height,
          duration: video.duration,
          thumbnailUrl: file.thumbnail,
          previewUrl: file.thumbnail,
          contentUrl: file.url,
          sourceUrl: video.pageURL,
          author: { name: video.user },
        },
      ];
    });
  }
}
