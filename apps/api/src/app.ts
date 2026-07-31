import { aggregateSearch, createProviderRegistry, providerNames } from '@clipflow/providers';
import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';

const searchSchema = z.object({
  query: z.string().trim().min(2, '搜索内容至少需要 2 个字符').max(200),
  type: z.enum(['all', 'image', 'video', 'gif']).default('all'),
  page: z.coerce.number().int().min(1).max(100).default(1),
  perPage: z.coerce.number().int().min(3).max(30).default(12),
});

export function createApp() {
  const app = express();
  const webOrigin = process.env.WEB_ORIGIN ?? 'http://localhost:3000';

  app.disable('x-powered-by');
  app.use(cors({ origin: webOrigin, methods: ['GET', 'POST'] }));
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
      const result = await aggregateSearch(createProviderRegistry(), input);
      response.json(result);
    } catch (error) {
      next(error);
    }
  };

  app.post('/search', searchHandler);
  app.post('/api/search', searchHandler);

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
