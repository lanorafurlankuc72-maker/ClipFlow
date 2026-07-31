import { describe, expect, it } from 'vitest';
import { aggregateSearch } from './aggregate.js';
import type { Asset, SearchProvider } from './types.js';

const asset: Asset = {
  id: 'one',
  provider: 'pexels',
  type: 'image',
  title: 'electric car factory',
  width: 1200,
  height: 800,
  thumbnailUrl: 'https://cdn.example.com/one.jpg?w=400',
  previewUrl: 'https://cdn.example.com/one.jpg?w=900',
  contentUrl: 'https://cdn.example.com/one.jpg?w=2400',
  sourceUrl: 'https://example.com/one',
  author: { name: 'ClipFlow' },
};

function provider(overrides: Partial<SearchProvider> = {}): SearchProvider {
  return {
    name: 'pexels',
    supportedTypes: ['image'],
    isConfigured: () => true,
    search: async () => [asset],
    ...overrides,
  };
}

describe('aggregateSearch', () => {
  it('keeps successful results when another provider fails', async () => {
    const result = await aggregateSearch(
      [
        provider(),
        provider({
          name: 'pixabay',
          search: async () => {
            throw new Error('offline');
          },
        }),
      ],
      { query: 'electric car', type: 'image', page: 1, perPage: 12 },
    );
    expect(result.assets).toHaveLength(1);
    expect(result.providers).toEqual(
      expect.arrayContaining([expect.objectContaining({ provider: 'pixabay', status: 'error' })]),
    );
  });

  it('deduplicates canonical content URLs', async () => {
    const result = await aggregateSearch([provider(), provider({ name: 'pixabay' })], {
      query: 'factory',
      type: 'image',
      page: 1,
      perPage: 12,
    });
    expect(result.assets).toHaveLength(1);
  });
});
