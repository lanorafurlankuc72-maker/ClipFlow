import request from 'supertest';
import { describe, expect, it } from 'vitest';
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

describe('ClipFlow API', () => {
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

  it('returns 404 for a missing project', async () => {
    const response = await request(createTestApp()).get('/project/missing');
    expect(response.status).toBe(404);
    expect(response.body.error).toBe('project_not_found');
  });
});
