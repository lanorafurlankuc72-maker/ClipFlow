import { fetchJson, safeTitle } from '../http.js';
import type { Asset, SearchProvider, SearchRequest } from '../types.js';

interface PexelsPhotoResponse {
  photos: Array<{
    id: number;
    width: number;
    height: number;
    alt: string;
    url: string;
    photographer: string;
    photographer_url: string;
    src: { medium: string; large: string; original: string };
  }>;
}

interface PexelsVideoResponse {
  videos: Array<{
    id: number;
    width: number;
    height: number;
    duration: number;
    url: string;
    image: string;
    user: { name: string; url: string };
    video_files: Array<{ width: number | null; link: string; quality: string }>;
  }>;
}

export class PexelsProvider implements SearchProvider {
  readonly name = 'pexels' as const;
  readonly supportedTypes = ['image', 'video'] as const;

  constructor(private readonly apiKey = process.env.PEXELS_API_KEY) {}

  isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  async search(request: SearchRequest): Promise<Asset[]> {
    if (!this.apiKey) return [];

    const searches: Promise<Asset[]>[] = [];
    if (request.type === 'all' || request.type === 'image')
      searches.push(this.searchPhotos(request));
    if (request.type === 'all' || request.type === 'video')
      searches.push(this.searchVideos(request));
    return (await Promise.all(searches)).flat();
  }

  private async searchPhotos(request: SearchRequest): Promise<Asset[]> {
    const url = new URL('https://api.pexels.com/v1/search');
    url.search = new URLSearchParams({
      query: request.query,
      page: String(request.page),
      per_page: String(request.perPage),
      locale: 'zh-CN',
    }).toString();
    const data = await fetchJson<PexelsPhotoResponse>(url, {
      headers: { Authorization: this.apiKey ?? '' },
      signal: request.signal,
    });
    return data.photos.map((photo) => ({
      id: `pexels-photo-${photo.id}`,
      provider: this.name,
      type: 'image',
      title: safeTitle(photo.alt, `Pexels 图片 ${photo.id}`),
      width: photo.width,
      height: photo.height,
      thumbnailUrl: photo.src.medium,
      previewUrl: photo.src.large,
      contentUrl: photo.src.original,
      sourceUrl: photo.url,
      author: { name: photo.photographer, url: photo.photographer_url },
    }));
  }

  private async searchVideos(request: SearchRequest): Promise<Asset[]> {
    const url = new URL('https://api.pexels.com/videos/search');
    url.search = new URLSearchParams({
      query: request.query,
      page: String(request.page),
      per_page: String(request.perPage),
      locale: 'zh-CN',
    }).toString();
    const data = await fetchJson<PexelsVideoResponse>(url, {
      headers: { Authorization: this.apiKey ?? '' },
      signal: request.signal,
    });
    return data.videos.map((video) => {
      const file = [...video.video_files]
        .filter((item) => item.width)
        .sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0];
      return {
        id: `pexels-video-${video.id}`,
        provider: this.name,
        type: 'video' as const,
        title: `Pexels 视频 ${video.id}`,
        width: video.width,
        height: video.height,
        duration: video.duration,
        thumbnailUrl: video.image,
        previewUrl: video.image,
        contentUrl: file?.link ?? video.url,
        sourceUrl: video.url,
        author: { name: video.user.name, url: video.user.url },
      };
    });
  }
}
