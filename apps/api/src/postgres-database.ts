import type { Asset } from '@clipflow/providers';
import { Pool, type QueryResultRow } from 'pg';
import {
  ProjectNotFoundError,
  type DownloadEntry,
  type Project,
  type ProjectSummary,
  type SearchHistoryEntry,
  type UserAccount,
  type UserCredentials,
} from './database.js';

export class PostgresClipFlowDatabase {
  private readonly pool: Pool;
  private readonly initialized: Promise<void>;

  constructor(connectionString: string) {
    this.pool = new Pool({ connectionString: normalizeConnectionString(connectionString), max: 10 });
    this.initialized = this.initialize();
  }

  async ready(): Promise<void> {
    await this.initialized;
  }

  private async initialize(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        password_salt TEXT NOT NULL,
        plan TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'pro')),
        stripe_customer_id TEXT,
        stripe_subscription_id TEXT,
        subscription_status TEXT NOT NULL DEFAULT 'inactive',
        current_period_end TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS sessions (
        token_hash TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS user_favorites (
        user_id TEXT NOT NULL,
        asset_id TEXT NOT NULL,
        asset_json TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id, asset_id)
      );
      CREATE TABLE IF NOT EXISTS user_downloads (
        id BIGSERIAL PRIMARY KEY,
        user_id TEXT NOT NULL,
        asset_id TEXT NOT NULL,
        provider TEXT NOT NULL,
        title TEXT NOT NULL,
        url TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS user_search_history (
        id BIGSERIAL PRIMARY KEY,
        user_id TEXT NOT NULL,
        query TEXT NOT NULL,
        search_query TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS user_projects (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS user_project_assets (
        project_id TEXT NOT NULL REFERENCES user_projects(id) ON DELETE CASCADE,
        asset_id TEXT NOT NULL,
        asset_json TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (project_id, asset_id)
      );
      CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions(expires_at);
      CREATE INDEX IF NOT EXISTS user_favorites_owner_idx ON user_favorites(user_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS user_downloads_owner_idx ON user_downloads(user_id, id DESC);
      CREATE INDEX IF NOT EXISTS user_search_history_owner_idx ON user_search_history(user_id, id DESC);
      CREATE INDEX IF NOT EXISTS user_projects_owner_idx ON user_projects(user_id, updated_at DESC);
    `);
  }

  async createUser(
    id: string,
    email: string,
    passwordHash: string,
    passwordSalt: string,
  ): Promise<UserAccount> {
    await this.ready();
    await this.pool.query(
      `INSERT INTO users (id, email, password_hash, password_salt) VALUES ($1, $2, $3, $4)`,
      [id, email, passwordHash, passwordSalt],
    );
    return (await this.getUserById(id))!;
  }

  async getUserCredentialsByEmail(email: string): Promise<UserCredentials | undefined> {
    await this.ready();
    const { rows } = await this.pool.query(
      `SELECT id, email, password_hash, password_salt, plan, stripe_customer_id,
              stripe_subscription_id, subscription_status, current_period_end, created_at
       FROM users WHERE email = $1`,
      [email],
    );
    return rows[0] ? mapUserCredentials(rows[0]) : undefined;
  }

  async getUserById(userId: string): Promise<UserAccount | undefined> {
    await this.ready();
    const { rows } = await this.pool.query(
      `SELECT id, email, plan, stripe_customer_id, stripe_subscription_id,
              subscription_status, current_period_end, created_at
       FROM users WHERE id = $1`,
      [userId],
    );
    return rows[0] ? mapUser(rows[0]) : undefined;
  }

  async createSession(tokenHash: string, userId: string, expiresAt: string): Promise<void> {
    await this.ready();
    await this.pool.query(
      'INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)',
      [tokenHash, userId, expiresAt],
    );
  }

  async getUserBySession(tokenHash: string): Promise<UserAccount | undefined> {
    await this.ready();
    await this.pool.query('DELETE FROM sessions WHERE expires_at <= CURRENT_TIMESTAMP');
    const { rows } = await this.pool.query(
      `SELECT users.id, users.email, users.plan, users.stripe_customer_id,
              users.stripe_subscription_id, users.subscription_status,
              users.current_period_end, users.created_at
       FROM sessions JOIN users ON users.id = sessions.user_id
       WHERE sessions.token_hash = $1 AND sessions.expires_at > CURRENT_TIMESTAMP`,
      [tokenHash],
    );
    return rows[0] ? mapUser(rows[0]) : undefined;
  }

  async deleteSession(tokenHash: string): Promise<void> {
    await this.ready();
    await this.pool.query('DELETE FROM sessions WHERE token_hash = $1', [tokenHash]);
  }

  async upgradeUser(
    userId: string,
    customerId: string | undefined,
    subscriptionId: string,
  ): Promise<UserAccount> {
    await this.ready();
    await this.pool.query(
      `UPDATE users SET plan = 'pro', stripe_customer_id = COALESCE($1, stripe_customer_id),
              stripe_subscription_id = $2, subscription_status = 'active' WHERE id = $3`,
      [customerId ?? null, subscriptionId, userId],
    );
    return (await this.getUserById(userId))!;
  }

  async updateSubscriptionByStripeReference(
    subscriptionId: string | undefined,
    customerId: string | undefined,
    status: string,
    currentPeriodEnd?: string,
  ): Promise<UserAccount | undefined> {
    await this.ready();
    if (!subscriptionId && !customerId) return undefined;
    const reference = subscriptionId ?? customerId!;
    const column = subscriptionId ? 'stripe_subscription_id' : 'stripe_customer_id';
    const { rows } = await this.pool.query(`SELECT id FROM users WHERE ${column} = $1`, [reference]);
    if (!rows[0]) return undefined;
    const userId = String(rows[0].id);
    const active = ['active', 'trialing'].includes(status);
    await this.pool.query(
      `UPDATE users SET plan = $1, subscription_status = $2,
              current_period_end = COALESCE($3, current_period_end),
              stripe_customer_id = COALESCE($4, stripe_customer_id),
              stripe_subscription_id = COALESCE($5, stripe_subscription_id) WHERE id = $6`,
      [active ? 'pro' : 'free', status, currentPeriodEnd ?? null, customerId ?? null, subscriptionId ?? null, userId],
    );
    return this.getUserById(userId);
  }

  async addFavorite(asset: Asset, userId = 'guest'): Promise<Asset> {
    await this.ready();
    await this.pool.query(
      `INSERT INTO user_favorites (user_id, asset_id, asset_json) VALUES ($1, $2, $3)
       ON CONFLICT(user_id, asset_id) DO UPDATE SET asset_json = EXCLUDED.asset_json`,
      [userId, asset.id, JSON.stringify(asset)],
    );
    return asset;
  }

  async removeFavorite(assetId: string, userId = 'guest'): Promise<boolean> {
    await this.ready();
    const result = await this.pool.query(
      'DELETE FROM user_favorites WHERE user_id = $1 AND asset_id = $2',
      [userId, assetId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async listFavorites(userId = 'guest'): Promise<Asset[]> {
    await this.ready();
    const { rows } = await this.pool.query(
      'SELECT asset_json FROM user_favorites WHERE user_id = $1 ORDER BY created_at DESC',
      [userId],
    );
    return rows.flatMap(parseAssetRow);
  }

  async recordDownload(asset: Asset, userId = 'guest'): Promise<DownloadEntry> {
    await this.ready();
    const { rows } = await this.pool.query(
      `INSERT INTO user_downloads (user_id, asset_id, provider, title, url)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, asset_id, provider, title, url, created_at`,
      [userId, asset.id, asset.provider, asset.title, asset.contentUrl],
    );
    return mapDownload(rows[0]);
  }

  async listDownloads(limit = 50, userId = 'guest'): Promise<DownloadEntry[]> {
    await this.ready();
    const { rows } = await this.pool.query(
      `SELECT id, asset_id, provider, title, url, created_at
       FROM user_downloads WHERE user_id = $1 ORDER BY id DESC LIMIT $2`,
      [userId, limit],
    );
    return rows.map(mapDownload);
  }

  async recordSearch(query: string, searchQuery: string, userId = 'guest'): Promise<void> {
    await this.ready();
    await this.pool.query(
      'INSERT INTO user_search_history (user_id, query, search_query) VALUES ($1, $2, $3)',
      [userId, query, searchQuery],
    );
  }

  async listSearchHistory(limit = 20, userId = 'guest'): Promise<SearchHistoryEntry[]> {
    await this.ready();
    const { rows } = await this.pool.query(
      `SELECT id, query, search_query, created_at
       FROM user_search_history WHERE user_id = $1 ORDER BY id DESC LIMIT $2`,
      [userId, limit],
    );
    return rows.map((row) => ({
      id: Number(row.id),
      query: String(row.query),
      searchQuery: String(row.search_query),
      createdAt: asTimestamp(row.created_at),
    }));
  }

  async createProject(
    id: string,
    name: string,
    description: string,
    userId = 'guest',
  ): Promise<Project> {
    await this.ready();
    await this.pool.query(
      'INSERT INTO user_projects (id, user_id, name, description) VALUES ($1, $2, $3, $4)',
      [id, userId, name, description],
    );
    return this.getProject(id, userId);
  }

  async listProjects(userId = 'guest'): Promise<ProjectSummary[]> {
    await this.ready();
    const { rows } = await this.pool.query(
      `SELECT p.id, p.name, p.description, p.created_at, p.updated_at,
              COUNT(a.asset_id)::integer AS asset_count
       FROM user_projects p LEFT JOIN user_project_assets a ON a.project_id = p.id
       WHERE p.user_id = $1 GROUP BY p.id
       ORDER BY p.updated_at DESC, p.created_at DESC`,
      [userId],
    );
    return rows.map(mapProjectSummary);
  }

  async getProject(projectId: string, userId = 'guest'): Promise<Project> {
    await this.ready();
    const { rows } = await this.pool.query(
      `SELECT p.id, p.name, p.description, p.created_at, p.updated_at,
              COUNT(a.asset_id)::integer AS asset_count
       FROM user_projects p LEFT JOIN user_project_assets a ON a.project_id = p.id
       WHERE p.id = $1 AND p.user_id = $2 GROUP BY p.id`,
      [projectId, userId],
    );
    if (!rows[0]) throw new ProjectNotFoundError();
    const assetResult = await this.pool.query(
      'SELECT asset_json FROM user_project_assets WHERE project_id = $1 ORDER BY created_at DESC',
      [projectId],
    );
    return { ...mapProjectSummary(rows[0]), assets: assetResult.rows.flatMap(parseAssetRow) };
  }

  async deleteProject(projectId: string, userId = 'guest'): Promise<boolean> {
    await this.ready();
    const result = await this.pool.query('DELETE FROM user_projects WHERE id = $1 AND user_id = $2', [projectId, userId]);
    return (result.rowCount ?? 0) > 0;
  }

  async addProjectAsset(projectId: string, asset: Asset, userId = 'guest'): Promise<Project> {
    await this.touchProject(projectId, userId);
    await this.pool.query(
      `INSERT INTO user_project_assets (project_id, asset_id, asset_json) VALUES ($1, $2, $3)
       ON CONFLICT(project_id, asset_id) DO UPDATE SET asset_json = EXCLUDED.asset_json`,
      [projectId, asset.id, JSON.stringify(asset)],
    );
    return this.getProject(projectId, userId);
  }

  async removeProjectAsset(projectId: string, assetId: string, userId = 'guest'): Promise<Project> {
    await this.touchProject(projectId, userId);
    await this.pool.query('DELETE FROM user_project_assets WHERE project_id = $1 AND asset_id = $2', [projectId, assetId]);
    return this.getProject(projectId, userId);
  }

  async updateProject(
    projectId: string,
    name: string,
    description: string,
    userId = 'guest',
  ): Promise<Project> {
    await this.ready();
    const result = await this.pool.query(
      `UPDATE user_projects SET name = $1, description = $2, updated_at = CURRENT_TIMESTAMP
       WHERE id = $3 AND user_id = $4`,
      [name, description, projectId, userId],
    );
    if ((result.rowCount ?? 0) === 0) throw new ProjectNotFoundError();
    return this.getProject(projectId, userId);
  }

  async addProjectAssets(projectId: string, assets: Asset[], userId = 'guest'): Promise<Project> {
    await this.touchProject(projectId, userId);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      for (const asset of assets) {
        await client.query(
          `INSERT INTO user_project_assets (project_id, asset_id, asset_json) VALUES ($1, $2, $3)
           ON CONFLICT(project_id, asset_id) DO UPDATE SET asset_json = EXCLUDED.asset_json`,
          [projectId, asset.id, JSON.stringify(asset)],
        );
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    return this.getProject(projectId, userId);
  }

  async clearProjectAssets(projectId: string, userId = 'guest'): Promise<Project> {
    await this.touchProject(projectId, userId);
    await this.pool.query('DELETE FROM user_project_assets WHERE project_id = $1', [projectId]);
    return this.getProject(projectId, userId);
  }

  private async touchProject(projectId: string, userId: string): Promise<void> {
    await this.ready();
    const result = await this.pool.query(
      'UPDATE user_projects SET updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND user_id = $2',
      [projectId, userId],
    );
    if ((result.rowCount ?? 0) === 0) throw new ProjectNotFoundError();
  }
}

function parseAssetRow(row: QueryResultRow): Asset[] {
  try {
    return [JSON.parse(String(row.asset_json)) as Asset];
  } catch {
    return [];
  }
}

function mapProjectSummary(row: QueryResultRow): ProjectSummary {
  return {
    id: String(row.id),
    name: String(row.name),
    description: String(row.description),
    assetCount: Number(row.asset_count),
    createdAt: asTimestamp(row.created_at),
    updatedAt: asTimestamp(row.updated_at),
  };
}

function mapDownload(row: QueryResultRow | undefined): DownloadEntry {
  if (!row) throw new Error('下载记录写入失败');
  return {
    id: Number(row.id),
    assetId: String(row.asset_id),
    provider: String(row.provider),
    title: String(row.title),
    url: String(row.url),
    createdAt: asTimestamp(row.created_at),
  };
}

function mapUser(row: QueryResultRow): UserAccount {
  return {
    id: String(row.id),
    email: String(row.email),
    plan: row.plan === 'pro' ? 'pro' : 'free',
    ...(row.stripe_customer_id ? { stripeCustomerId: String(row.stripe_customer_id) } : {}),
    ...(row.stripe_subscription_id ? { stripeSubscriptionId: String(row.stripe_subscription_id) } : {}),
    subscriptionStatus: row.subscription_status ? String(row.subscription_status) : 'inactive',
    ...(row.current_period_end ? { currentPeriodEnd: asTimestamp(row.current_period_end) } : {}),
    createdAt: asTimestamp(row.created_at),
  };
}

function mapUserCredentials(row: QueryResultRow): UserCredentials {
  return {
    ...mapUser(row),
    passwordHash: String(row.password_hash),
    passwordSalt: String(row.password_salt),
  };
}

function asTimestamp(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

function normalizeConnectionString(connectionString: string): string {
  const url = new URL(connectionString);
  if (url.searchParams.get('sslmode') === 'require') {
    url.searchParams.set('sslmode', 'verify-full');
  }
  return url.toString();
}
