export const providerNames = ['pexels', 'pixabay', 'unsplash', 'giphy'] as const;

export type ProviderName = (typeof providerNames)[number];
export type AssetType = 'image' | 'video' | 'gif';
export type SearchAssetType = AssetType | 'all';

export interface SearchRequest {
  query: string;
  queries?: string[];
  type: SearchAssetType;
  page: number;
  perPage: number;
  signal?: AbortSignal;
}

export interface AssetAuthor {
  name: string;
  url?: string;
}

export interface Asset {
  id: string;
  provider: ProviderName;
  type: AssetType;
  title: string;
  width: number;
  height: number;
  thumbnailUrl: string;
  previewUrl: string;
  contentUrl: string;
  sourceUrl: string;
  author: AssetAuthor;
  duration?: number;
  score?: number;
}

export interface ProviderStatus {
  provider: ProviderName;
  status: 'ok' | 'unconfigured' | 'error' | 'skipped';
  count: number;
  message?: string;
}

export interface SearchResult {
  query: string;
  assets: Asset[];
  providers: ProviderStatus[];
  total: number;
  elapsedMs: number;
  analysis?: {
    usedAi: boolean;
    provider: 'openai' | 'deepseek' | null;
    searchQuery: string;
    keywords: string[];
    searchQueries?: string[];
  };
}

export interface SearchProvider {
  readonly name: ProviderName;
  readonly supportedTypes: readonly AssetType[];
  isConfigured(): boolean;
  search(request: SearchRequest): Promise<Asset[]>;
}
