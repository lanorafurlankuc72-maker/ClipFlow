import type {
  Asset,
  ProviderStatus,
  SearchProvider,
  SearchRequest,
  SearchResult,
} from './types.js';

function canonicalUrl(value: string): string {
  try {
    const url = new URL(value);
    return `${url.hostname}${url.pathname}`.toLowerCase().replace(/\/$/, '');
  } catch {
    return value.toLowerCase();
  }
}

function rankAsset(asset: Asset, query: string, index: number): Asset {
  const terms = query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const haystack = `${asset.title} ${asset.author.name}`.toLocaleLowerCase();
  const matches = terms.filter((term) => haystack.includes(term)).length;
  return { ...asset, score: Number((1 / (index + 1) + matches * 0.25).toFixed(4)) };
}

function deduplicate(assets: Asset[]): Asset[] {
  const seen = new Set<string>();
  return assets.filter((asset) => {
    const key = canonicalUrl(asset.contentUrl || asset.sourceUrl);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function aggregateSearch(
  providers: readonly SearchProvider[],
  request: SearchRequest,
): Promise<SearchResult> {
  const startedAt = performance.now();
  const activeProviders = providers.filter(
    (provider) => request.type === 'all' || provider.supportedTypes.includes(request.type),
  );
  const skippedProviders = providers.filter((provider) => !activeProviders.includes(provider));

  const outcomes = await Promise.all(
    activeProviders.map(async (provider): Promise<{ assets: Asset[]; status: ProviderStatus }> => {
      if (!provider.isConfigured()) {
        return {
          assets: [],
          status: {
            provider: provider.name,
            status: 'unconfigured',
            count: 0,
            message: '未配置 API Key',
          },
        };
      }
      try {
        const queries = [...new Set([request.query, ...(request.queries ?? [])])].slice(0, 3);
        const assets = (
          await Promise.all(queries.map((query) => provider.search({ ...request, query })))
        ).flat();
        return {
          assets,
          status: { provider: provider.name, status: 'ok', count: assets.length },
        };
      } catch (error) {
        return {
          assets: [],
          status: {
            provider: provider.name,
            status: 'error',
            count: 0,
            message: error instanceof Error ? error.message : '未知 Provider 错误',
          },
        };
      }
    }),
  );

  const assets = deduplicate(
    outcomes.flatMap((outcome) =>
      outcome.assets.map((asset, index) => rankAsset(asset, request.query, index)),
    ),
  ).sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

  return {
    query: request.query,
    assets,
    providers: [
      ...outcomes.map((outcome) => outcome.status),
      ...skippedProviders.map((provider) => ({
        provider: provider.name,
        status: 'skipped' as const,
        count: 0,
        message: `不支持 ${request.type} 类型`,
      })),
    ],
    total: assets.length,
    elapsedMs: Math.round(performance.now() - startedAt),
  };
}
