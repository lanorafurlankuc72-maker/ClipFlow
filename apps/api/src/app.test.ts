import request from 'supertest';
import { createHmac } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from './app.js';

const testAsset = {
  id: 'pexels-video-1',
  provider: 'pexels',
  type: 'video',
  title: 'City aerial',
  width: 1920,
  height: 1080,
  thumbnailUrl: 'https://images.example.com/city.jpg',
  previewUrl: 'https://videos.example.com/city-preview.mp4',
  contentUrl: 'https://videos.example.com/city.mp4',
  sourceUrl: 'https://example.com/city',
  author: { name: 'Creator', url: 'https://example.com/creator' },
  duration: 12,
} as const;

function createTestApp() {
  return createApp({ databasePath: ':memory:' });
}

function stripeSignature(body: string, secret = 'whsec_test_secret') {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
  return `t=${timestamp},v1=${signature}`;
}

describe('ClipFlow API', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('returns service health', async () => {
    const response = await request(createTestApp()).get('/health');
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ status: 'ok', service: 'clipflow-api' });
  });

  it('validates search input', async () => {
    const response = await request(createTestApp()).post('/search').send({ query: 'a' });
    expect(response.status).toBe(400);
    expect(response.body.error).toBe('validation_error');
  });

  it('reports unconfigured providers without failing the request', async () => {
    const response = await request(createTestApp()).post('/search').send({ query: '城市航拍' });
    expect(response.status).toBe(200);
    expect(response.body.providers).toHaveLength(4);
    expect(response.body.assets).toEqual([]);
  });

  it('returns an AI voiceover breakdown from DeepSeek', async () => {
    vi.stubEnv('AI_PROVIDER', 'deepseek');
    vi.stubEnv('DEEPSEEK_API_KEY', 'test-key');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    segments: [
                      {
                        narration: '每一个清晨，都是新的开始。',
                        duration: 4,
                        emotion: '温暖',
                        energy: 3,
                        shotType: '全景空镜',
                        visualSuggestion: '清晨阳光洒在城市街道',
                        keywords: ['清晨', '阳光', '城市街道'],
                        searchQuery: 'city street sunrise morning',
                        soundEffects: [
                          {
                            type: 'ambient',
                            label: '清晨城市环境',
                            searchQuery: 'morning city ambience birds',
                          },
                        ],
                      },
                    ],
                    overallEmotion: '温暖',
                    arc: '渐进上扬',
                  }),
                },
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );
    const response = await request(createTestApp())
      .post('/script/analyze')
      .send({ script: '每一个清晨，都是新的开始。' });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      usedAi: true,
      provider: 'deepseek',
      overallEmotion: '温暖',
      totalDuration: 4,
    });
    expect(response.body.segments[0].searchQuery).toBe('city street sunrise morning');
    expect(response.body.segments[0].soundEffects[0]).toMatchObject({
      type: 'ambient',
      label: '清晨城市环境',
    });
  });

  it('searches previewable sound effects with safe licenses', async () => {
    vi.stubEnv('FREESOUND_API_KEY', 'test-freesound-key');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            count: 1,
            next: null,
            results: [
              {
                id: 42,
                name: 'City ambience.wav',
                duration: 12.4,
                username: 'field-recorder',
                license: 'Creative Commons 0',
                url: 'https://freesound.org/s/42/',
                tags: ['city', 'traffic'],
                previews: { 'preview-hq-mp3': 'https://cdn.example.com/city.mp3' },
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );
    const response = await request(createTestApp())
      .post('/sound/search')
      .send({ query: 'city ambience' });
    expect(response.status).toBe(200);
    expect(response.body.configured).toBe(true);
    expect(response.body.sounds[0]).toMatchObject({
      id: 'freesound-42',
      license: 'CC0',
      previewUrl: 'https://cdn.example.com/city.mp3',
    });
  });

  it('reports when sound search is not configured', async () => {
    vi.stubEnv('FREESOUND_API_KEY', '');
    const response = await request(createTestApp())
      .post('/sound/search')
      .send({ query: 'soft whoosh' });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ configured: false, sounds: [] });
  });

  it('lets the web app fall back when DeepSeek is not configured', async () => {
    vi.stubEnv('AI_PROVIDER', 'none');
    vi.stubEnv('DEEPSEEK_API_KEY', '');
    const response = await request(createTestApp())
      .post('/script/analyze')
      .send({ script: '这是一段用于测试的口播文案。' });
    expect(response.status).toBe(503);
    expect(response.body.error).toBe('ai_unavailable');
  });

  it('persists and removes favorites', async () => {
    const app = createTestApp();
    const created = await request(app).post('/favorite').send(testAsset);
    expect(created.status).toBe(201);

    const favorites = await request(app).get('/favorites');
    expect(favorites.body.assets).toEqual([testAsset]);

    const removed = await request(app).delete(`/favorite/${testAsset.id}`);
    expect(removed.body.removed).toBe(true);
    expect((await request(app).get('/favorites')).body.assets).toEqual([]);
  });

  it('records downloads', async () => {
    const app = createTestApp();
    const created = await request(app).post('/download').send(testAsset);
    expect(created.status).toBe(201);
    expect(created.body.downloadUrl).toBe(testAsset.contentUrl);

    const downloads = await request(app).get('/downloads');
    expect(downloads.body.downloads[0]).toMatchObject({
      assetId: testAsset.id,
      provider: testAsset.provider,
      title: testAsset.title,
    });
  });

  it('records search history', async () => {
    const app = createTestApp();
    await request(app).post('/search').send({ query: 'city aerial' });
    const history = await request(app).get('/history');
    expect(history.body.history[0]).toMatchObject({
      query: 'city aerial',
      searchQuery: 'city aerial',
    });
  });

  it('creates projects and manages project assets', async () => {
    const app = createTestApp();
    const created = await request(app)
      .post('/project')
      .send({ name: '品牌短片', description: '发布会剪辑素材' });
    expect(created.status).toBe(201);
    const projectId = String(created.body.project.id);

    const withAsset = await request(app).post(`/project/${projectId}/assets`).send(testAsset);
    expect(withAsset.status).toBe(201);
    expect(withAsset.body.project.assetCount).toBe(1);
    expect(withAsset.body.project.assets).toEqual([testAsset]);

    const projects = await request(app).get('/project');
    expect(projects.body.projects[0]).toMatchObject({
      id: projectId,
      name: '品牌短片',
      assetCount: 1,
    });

    const withoutAsset = await request(app).delete(`/project/${projectId}/assets/${testAsset.id}`);
    expect(withoutAsset.body.project.assetCount).toBe(0);

    const removed = await request(app).delete(`/project/${projectId}`);
    expect(removed.body.removed).toBe(true);
  });

  it('updates, bulk-manages and exports a project', async () => {
    const app = createTestApp();
    const created = await request(app).post('/project').send({ name: 'Draft' });
    const projectId = String(created.body.project.id);
    const updated = await request(app)
      .patch(`/project/${projectId}`)
      .send({ name: 'Campaign', description: 'Autumn launch' });
    expect(updated.body.project).toMatchObject({ name: 'Campaign', description: 'Autumn launch' });

    const bulk = await request(app)
      .post(`/project/${projectId}/assets/bulk`)
      .send({ assets: [testAsset] });
    expect(bulk.body.project.assetCount).toBe(1);

    const exported = await request(app).get(`/project/${projectId}/export`);
    expect(exported.body.project.assets).toEqual([testAsset]);
    expect(exported.headers['content-disposition']).toContain('attachment');

    const cleared = await request(app).delete(`/project/${projectId}/assets`);
    expect(cleared.body.project.assetCount).toBe(0);
  });

  it('returns 404 for a missing project', async () => {
    const response = await request(createTestApp()).get('/project/missing');
    expect(response.status).toBe(404);
    expect(response.body.error).toBe('project_not_found');
  });

  it('registers, restores and logs out an account session', async () => {
    const agent = request.agent(createTestApp());
    const registered = await agent
      .post('/auth/register')
      .send({ email: 'Editor@clipflow.test', password: 'secure-pass-123' });
    expect(registered.status).toBe(201);
    expect(registered.body.user).toMatchObject({
      email: 'editor@clipflow.test',
      plan: 'free',
    });
    expect(registered.headers['set-cookie']?.[0]).toContain('HttpOnly');

    const current = await agent.get('/auth/me');
    expect(current.body.user.email).toBe('editor@clipflow.test');

    expect((await agent.post('/auth/logout')).status).toBe(200);
    expect((await agent.get('/auth/me')).body.user).toBeNull();
  });

  it('rejects duplicate accounts and invalid passwords', async () => {
    const app = createTestApp();
    const credentials = { email: 'hello@clipflow.test', password: 'secure-pass-123' };
    await request(app).post('/auth/register').send(credentials);
    expect((await request(app).post('/auth/register').send(credentials)).status).toBe(409);
    expect(
      (
        await request(app)
          .post('/auth/login')
          .send({ ...credentials, password: 'wrong-password' })
      ).status,
    ).toBe(401);
  });

  it('keeps billing optional and requires an authenticated account', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', '');
    vi.stubEnv('STRIPE_PRICE_ID', '');
    const app = createTestApp();
    expect((await request(app).get('/billing/status')).body.configured).toBe(false);
    expect((await request(app).post('/billing/checkout')).status).toBe(401);

    const agent = request.agent(app);
    await agent
      .post('/auth/register')
      .send({ email: 'pay@clipflow.test', password: 'secure-pass-123' });
    const checkout = await agent.post('/billing/checkout');
    expect(checkout.status).toBe(503);
    expect(checkout.body.error).toBe('billing_not_configured');
  });

  it('isolates saved data between signed-in accounts', async () => {
    const app = createTestApp();
    const first = request.agent(app);
    const second = request.agent(app);
    await first
      .post('/auth/register')
      .send({ email: 'first@clipflow.test', password: 'secure-pass-123' });
    await second
      .post('/auth/register')
      .send({ email: 'second@clipflow.test', password: 'secure-pass-123' });

    await first.post('/favorite').send(testAsset);
    const project = await first.post('/project').send({ name: 'Private project' });
    await first.post(`/project/${project.body.project.id}/assets`).send(testAsset);
    expect((await first.get('/favorites')).body.assets).toHaveLength(1);
    expect((await second.get('/favorites')).body.assets).toEqual([]);
    expect((await second.get('/project')).body.projects).toEqual([]);
    expect((await second.get(`/project/${project.body.project.id}`)).status).toBe(404);
    expect(
      (await second.delete(`/project/${project.body.project.id}/assets/${testAsset.id}`)).status,
    ).toBe(404);
    expect((await first.get(`/project/${project.body.project.id}`)).body.project.assetCount).toBe(
      1,
    );
  });

  it('verifies Stripe webhook signatures before upgrading an account', async () => {
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_test_secret');
    const app = createTestApp();
    const agent = request.agent(app);
    const registered = await agent
      .post('/auth/register')
      .send({ email: 'pro@clipflow.test', password: 'secure-pass-123' });
    const body = JSON.stringify({
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test_complete',
          status: 'complete',
          payment_status: 'paid',
          client_reference_id: registered.body.user.id,
          customer: 'cus_test',
          subscription: 'sub_test',
        },
      },
    });
    const webhook = await request(app)
      .post('/billing/webhook')
      .set('Content-Type', 'application/json')
      .set('Stripe-Signature', stripeSignature(body))
      .send(body);
    expect(webhook.status).toBe(200);
    expect((await agent.get('/auth/me')).body.user.plan).toBe('pro');

    const canceledBody = JSON.stringify({
      type: 'customer.subscription.deleted',
      data: { object: { id: 'sub_test', customer: 'cus_test', status: 'canceled' } },
    });
    expect(
      (
        await request(app)
          .post('/billing/webhook')
          .set('Content-Type', 'application/json')
          .set('Stripe-Signature', stripeSignature(canceledBody))
          .send(canceledBody)
      ).status,
    ).toBe(200);
    expect((await agent.get('/auth/me')).body.user).toMatchObject({
      plan: 'free',
      subscriptionStatus: 'canceled',
    });
  });
});
