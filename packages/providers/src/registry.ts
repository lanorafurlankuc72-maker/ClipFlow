import { GiphyProvider } from './providers/giphy.js';
import { PexelsProvider } from './providers/pexels.js';
import { PixabayProvider } from './providers/pixabay.js';
import { UnsplashProvider } from './providers/unsplash.js';
import type { SearchProvider } from './types.js';

export function createProviderRegistry(): SearchProvider[] {
  return [new PexelsProvider(), new PixabayProvider(), new UnsplashProvider(), new GiphyProvider()];
}
