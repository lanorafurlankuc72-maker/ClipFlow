import { aggregateSearch, createProviderRegistry, providerNames } from '@clipflow/providers';
import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { analyzeSearchQuery, type SearchAnalysis } from './ai.js';
import {
  authenticateUser,
  currentUser,
  EmailAlreadyExistsError,
  endSession,
  InvalidCredentialsError,
  registerUser,
  startSession,
} from './auth.js';
import {
  BillingNotConfiguredError,
  billingConfigured,
  createCheckoutSession,
  InvalidWebhookSignatureError,
  isPaidSubscription,
  parseStripeWebhook,
  retrieveCheckoutSession,
  StripeApiError,
} from './billing.js';
import { ClipFlowDatabase, ProjectNotFoundError } from './database.js';

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

const projectSchema = z.object({
  name: z.string().trim().min(1, '项目名称不能为空').max(80),
  description: z.string().trim().max(300).default(''),
});

const credentialsSchema = z.object({
  email: z
    .email('请输入有效邮箱')
    .max(200)
    .transform((value) => value.toLowerCase()),
  password: z.string().min(8, '密码至少需要 8 位').max(128),
});

const checkoutSessionSchema = z.string().startsWith('cs_').max(300);

interface CreateAppOptions {
  databasePath?: string;
}

export function createApp(options: CreateAppOptions = {}) {
  const app = express();
  const webOrigin = process.env.WEB_ORIGIN ?? 'http://localhost:3000';
  const database = new ClipFlowDatabase(options.databasePath);
  const analysisCache = new Map<string, SearchAnalysis>();

  app.disable('x-powered-by');
  app.use(cors({ origin: webOrigin, methods: ['GET', 'POST', 'DELETE'], credentials: true }));

  app.post(
    '/billing/webhook',
    express.raw({ type: 'application/json', limit: '128kb' }),
    (request, response, next) => {
      try {
        const event = parseStripeWebhook(
          request.body as Buffer,
          request.headers['stripe-signature'] as string | undefined,
        );
        if (event.type === 'checkout.session.completed' && isPaidSubscription(event.data.object)) {
          const session = event.data.object;
          if (session.client_reference_id && session.subscription) {
            database.upgradeUser(
              session.client_reference_id,
              session.customer ?? undefined,
              session.subscription,
            );
          }
        }
        response.json({ received: true });
      } catch (error) {
        next(error);
      }
    },
  );
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

  app.post('/auth/register', (request, response, next) => {
    try {
      const input = credentialsSchema.parse(request.body);
      const user = registerUser(database, input.email, input.password);
      startSession(database, response, user.id);
      response.status(201).json({ user });
    } catch (error) {
      next(error);
    }
  });

  app.post('/auth/login', (request, response, next) => {
    try {
      const input = credentialsSchema.parse(request.body);
      const user = authenticateUser(database, input.email, input.password);
      startSession(database, response, user.id);
      response.json({ user });
    } catch (error) {
      next(error);
    }
  });

  app.post('/auth/logout', (request, response) => {
    endSession(database, request, response);
    response.json({ success: true });
  });

  app.get('/auth/me', (request, response) => {
    response.json({ user: currentUser(database, request) ?? null });
  });

  app.get('/billing/status', (request, response) => {
    response.json({
      configured: billingConfigured(),
      user: currentUser(database, request) ?? null,
    });
  });

  app.post('/billing/checkout', async (request, response, next) => {
    try {
      const user = currentUser(database, request);
      if (!user) {
        response.status(401).json({ error: 'unauthorized', message: '请先登录' });
        return;
      }
      const session = await createCheckoutSession(user);
      if (!session.url) throw new StripeApiError('Stripe 未返回付款地址');
      response.json({ url: session.url });
    } catch (error) {
      next(error);
    }
  });

  app.get('/billing/verify', async (request, response, next) => {
    try {
      const user = currentUser(database, request);
      if (!user) {
        response.status(401).json({ error: 'unauthorized', message: '请先登录' });
        return;
      }
      const sessionId = checkoutSessionSchema.parse(request.query.session_id);
      const session = await retrieveCheckoutSession(sessionId);
      if (session.client_reference_id !== user.id || !isPaidSubscription(session)) {
        response.status(400).json({ error: 'payment_unverified', message: '暂未确认付款' });
        return;
      }
      const updatedUser = database.upgradeUser(
        user.id,
        session.customer ?? undefined,
        session.subscription!,
      );
      response.json({ user: updatedUser });
    } catch (error) {
      next(error);
    }
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

  app.get('/project', (_request, response) => {
    response.json({ projects: database.listProjects() });
  });

  app.post('/project', (request, response, next) => {
    try {
      const input = projectSchema.parse(request.body);
      const project = database.createProject(randomUUID(), input.name, input.description);
      response.status(201).json({ project });
    } catch (error) {
      next(error);
    }
  });

  app.get('/project/:projectId', (request, response, next) => {
    try {
      response.json({ project: database.getProject(String(request.params.projectId)) });
    } catch (error) {
      next(error);
    }
  });

  app.delete('/project/:projectId', (request, response) => {
    response.json({ removed: database.deleteProject(String(request.params.projectId)) });
  });

  app.post('/project/:projectId/assets', (request, response, next) => {
    try {
      const asset = assetSchema.parse(request.body);
      const project = database.addProjectAsset(String(request.params.projectId), asset);
      response.status(201).json({ project });
    } catch (error) {
      next(error);
    }
  });

  app.delete('/project/:projectId/assets/:assetId', (request, response, next) => {
    try {
      const project = database.removeProjectAsset(
        String(request.params.projectId),
        String(request.params.assetId),
      );
      response.json({ project });
    } catch (error) {
      next(error);
    }
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
    if (error instanceof ProjectNotFoundError) {
      response.status(404).json({ error: 'project_not_found', message: error.message });
      return;
    }
    if (error instanceof EmailAlreadyExistsError) {
      response.status(409).json({ error: 'email_exists', message: '该邮箱已注册' });
      return;
    }
    if (error instanceof InvalidCredentialsError) {
      response.status(401).json({ error: 'invalid_credentials', message: '邮箱或密码错误' });
      return;
    }
    if (error instanceof BillingNotConfiguredError) {
      response.status(503).json({ error: 'billing_not_configured', message: '支付功能尚未配置' });
      return;
    }
    if (error instanceof InvalidWebhookSignatureError) {
      response.status(400).json({ error: 'invalid_signature', message: '支付回调签名无效' });
      return;
    }
    if (error instanceof StripeApiError) {
      response.status(502).json({ error: 'stripe_error', message: error.message });
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
