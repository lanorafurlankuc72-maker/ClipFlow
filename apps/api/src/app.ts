import { aggregateSearch, createProviderRegistry, providerNames } from '@clipflow/providers';
import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { analyzeSearchQuery, type SearchAnalysis } from './ai.js';
import { ClipFlowDatabase } from './database.js';

const searchSchema = z.object({
  query: z.string().trim().min(2, '搜索内容至少需要 2 个字符').max(200),
  type: z.enum(['all', 'image', 'video', 'gif']).default('all'),
  page: z.coerce.number().int().min(1).max(100).default(1),
  perPage: z.coerce.number().int().min(3).max(30).default(12),
});

const assetSchema = z.object({
  id: z.string().min(1).max(300),
  provider: z.enum(providerNames),
  type: z.enum(['image', 'video', 'gif']),
  title: z.string().min(1).max(500),
  width: z.number().nonnegative(),
  height: z.number().nonnegative(),
  thumbnailUrl: z.url(),
  previewUrl: z.url(),
  contentUrl: z.url(),
  sourceUrl: z.url(),
  author: z.object({ name: z.string().max(300), url: z.url().optional() }),
  duration: z.number().nonnegative().optional(),
  score: z.number().optional(),
});

interface CreateAppOptions {
  databasePath?: string;
}

export function createApp(options: CreateAppOptions = {}) {
  const app = express();
  const webOrigin = process.env.WEB_ORIGIN ?? 'http://localhost:3000';
  const database = new ClipFlowDatabase(options.databasePath);
  const analysisCache = new Map<string, SearchAnalysis>();

  app.disable('x-powered-by');
  app.use(cors({ origin: webOrigin, methods: ['GET', 'POST', 'DELETE'] }));
  app.use(express.json({ limit: '32kb' }));

  app.get('/health', (_request, response) => {
    response.json({ status: 'ok', service: 'clipflow-api' });
  });

  app.get('/providers', (_request, response) => {
    const registry = createProviderRegistry();
    response.json({
      providers: providerNames.map((name) => {
        const provider = registry.find((entry) => entry.name === name);
        return {
          name,
          configured: provider?.isConfigured() ?? false,
          supportedTypes: provider?.supportedTypes ?? [],
        };
      }),
    });
  });

  const searchHandler = async (request: Request, response: Response, next: NextFunction) => {
    try {
      const input = searchSchema.parse(request.body);
      const cacheKey = `${input.type}:${input.query.toLocaleLowerCase()}`;
      const analysis =
        analysisCache.get(cacheKey) ?? (await analyzeSearchQuery(input.query, input.type));
      analysisCache.set(cacheKey, analysis);
      const result = await aggregateSearch(createProviderRegistry(), {
        ...input,
        query: analysis.searchQuery,
      });
      if (input.page === 1) database.recordSearch(input.query, analysis.searchQuery);
      response.json({ ...result, query: input.query, analysis });
    } catch (error) {
      next(error);
    }
  };

  app.post('/search', searchHandler);
  app.post('/api/search', searchHandler);

  app.get('/favorites', (_request, response) => {
    response.json({ assets: database.listFavorites() });
  });

  app.post('/favorite', (request, response, next) => {
    try {
      const asset = assetSchema.parse(request.body);
      response.status(201).json({ asset: database.addFavorite(asset) });
    } catch (error) {
      next(error);
    }
  });

  app.delete('/favorite/:assetId', (request, response) => {
    const assetId = z.string().min(1).max(300).parse(request.params.assetId);
    response.json({ removed: database.removeFavorite(assetId) });
  });

  app.post('/download', (request, response, next) => {
    try {
      const asset = assetSchema.parse(request.body);
      const download = database.recordDownload(asset);
      response.status(201).json({ download, downloadUrl: asset.contentUrl });
    } catch (error) {
      next(error);
    }
  });

  app.get('/downloads', (_request, response) => {
    response.json({ downloads: database.listDownloads() });
  });

  app.get('/history', (_request, response) => {
    response.json({ history: database.listSearchHistory() });
  });

  app.use((_request, response) => {
    response.status(404).json({ error: 'not_found', message: '接口不存在' });
  });

  app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
    void _next;
    if (error instanceof z.ZodError) {
      response.status(400).json({
        error: 'validation_error',
        message: error.issues[0]?.message ?? '请求参数不正确',
        issues: error.issues,
      });
      return;
    }
    console.error(error);
    response.status(500).json({
      error: 'internal_error',
      message: '搜索服务暂时不可用，请稍后重试',
    });
  });

  return app;
}
