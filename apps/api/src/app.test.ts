import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from './app.js';

describe('ClipFlow API', () => {
  it('returns service health', async () => {
    const response = await request(createApp()).get('/health');
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ status: 'ok', service: 'clipflow-api' });
  });

  it('validates search input', async () => {
    const response = await request(createApp()).post('/search').send({ query: 'a' });
    expect(response.status).toBe(400);
    expect(response.body.error).toBe('validation_error');
  });

  it('reports unconfigured providers without failing the request', async () => {
    const response = await request(createApp()).post('/search').send({ query: '城市航拍' });
    expect(response.status).toBe(200);
    expect(response.body.providers).toHaveLength(4);
    expect(response.body.assets).toEqual([]);
  });
});
