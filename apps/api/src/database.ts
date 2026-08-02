import type { Asset } from '@clipflow/providers';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { PostgresClipFlowDatabase } from './postgres-database.js';

export interface SearchHistoryEntry {
  id: number;
  query: string;
  searchQuery: string;
  createdAt: string;
}

export interface DownloadEntry {
  id: number;
  assetId: string;
  provider: string;
  title: string;
  url: string;
  createdAt: string;
}

export interface ProjectSummary {
  id: string;
  name: string;
  description: string;
  assetCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface Project extends ProjectSummary {
  assets: Asset[];
}

export interface UserAccount {
  id: string;
  email: string;
  plan: 'free' | 'pro';
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  subscriptionStatus: string;
  currentPeriodEnd?: string;
  createdAt: string;
}

export interface UserCredentials extends UserAccount {
  passwordHash: string;
  passwordSalt: string;
}

export class ProjectNotFoundError extends Error {
  constructor() {
    super('项目不存在');
    this.name = 'ProjectNotFoundError';
  }
}

const defaultDatabasePath = fileURLToPath(new URL('../../../data/clipflow.db', import.meta.url));

class SqliteClipFlowDatabase {
  private readonly database: DatabaseSync;

  constructor(databasePath = process.env.DATABASE_PATH ?? defaultDatabasePath) {
    if (databasePath !== ':memory:') mkdirSync(dirname(databasePath), { recursive: true });
    this.database = new DatabaseSync(databasePath);
    this.database.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS favorites (
        id TEXT PRIMARY KEY,
        asset_json TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS downloads (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        asset_id TEXT NOT NULL,
        provider TEXT NOT NULL,
        title TEXT NOT NULL,
        url TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS search_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        query TEXT NOT NULL,
        search_query TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS project_assets (
        project_id TEXT NOT NULL,
        asset_id TEXT NOT NULL,
        asset_json TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (project_id, asset_id),
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      );
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
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS sessions (
        token_hash TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS user_favorites (
        user_id TEXT NOT NULL,
        asset_id TEXT NOT NULL,
        asset_json TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id, asset_id)
      );
      CREATE TABLE IF NOT EXISTS user_downloads (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        asset_id TEXT NOT NULL,
        provider TEXT NOT NULL,
        title TEXT NOT NULL,
        url TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS user_search_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        query TEXT NOT NULL,
        search_query TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS user_projects (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS user_project_assets (
        project_id TEXT NOT NULL,
        asset_id TEXT NOT NULL,
        asset_json TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (project_id, asset_id),
        FOREIGN KEY (project_id) REFERENCES user_projects(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id TEXT PRIMARY KEY,
        applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    const scopedMigration = this.database
      .prepare("SELECT id FROM schema_migrations WHERE id = 'user-scoped-data-v1'")
      .get();
    if (!scopedMigration) {
      this.database.exec(`
        BEGIN;
        INSERT OR IGNORE INTO user_favorites (user_id, asset_id, asset_json, created_at)
          SELECT 'guest', id, asset_json, created_at FROM favorites;
        INSERT INTO user_downloads (user_id, asset_id, provider, title, url, created_at)
          SELECT 'guest', asset_id, provider, title, url, created_at FROM downloads;
        INSERT INTO user_search_history (user_id, query, search_query, created_at)
          SELECT 'guest', query, search_query, created_at FROM search_history;
        INSERT OR IGNORE INTO user_projects (id, user_id, name, description, created_at, updated_at)
          SELECT id, 'guest', name, description, created_at, updated_at FROM projects;
        INSERT OR IGNORE INTO user_project_assets (project_id, asset_id, asset_json, created_at)
          SELECT project_id, asset_id, asset_json, created_at FROM project_assets;
        INSERT INTO schema_migrations (id) VALUES ('user-scoped-data-v1');
        COMMIT;
      `);
    }
    const userColumns = new Set(
      this.database
        .prepare('PRAGMA table_info(users)')
        .all()
        .map((row) => String(row.name)),
    );
    if (!userColumns.has('subscription_status'))
      this.database.exec(
        "ALTER TABLE users ADD COLUMN subscription_status TEXT NOT NULL DEFAULT 'inactive'",
      );
    if (!userColumns.has('current_period_end'))
      this.database.exec('ALTER TABLE users ADD COLUMN current_period_end TEXT');
  }

  createUser(id: string, email: string, passwordHash: string, passwordSalt: string): UserAccount {
    this.database
      .prepare(
        `INSERT INTO users (id, email, password_hash, password_salt)
         VALUES (?, ?, ?, ?)`,
      )
      .run(id, email, passwordHash, passwordSalt);
    return this.getUserById(id)!;
  }

  getUserCredentialsByEmail(email: string): UserCredentials | undefined {
    const row = this.database
      .prepare(
        `SELECT id, email, password_hash, password_salt, plan,
                stripe_customer_id, stripe_subscription_id, subscription_status,
                current_period_end, created_at
         FROM users WHERE email = ?`,
      )
      .get(email);
    return row ? mapUserCredentials(row) : undefined;
  }

  getUserById(userId: string): UserAccount | undefined {
    const row = this.database
      .prepare(
        `SELECT id, email, plan, stripe_customer_id, stripe_subscription_id,
                subscription_status, current_period_end, created_at
         FROM users WHERE id = ?`,
      )
      .get(userId);
    return row ? mapUser(row) : undefined;
  }

  createSession(tokenHash: string, userId: string, expiresAt: string): void {
    this.database
      .prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)')
      .run(tokenHash, userId, expiresAt);
  }

  getUserBySession(tokenHash: string): UserAccount | undefined {
    this.database.prepare('DELETE FROM sessions WHERE expires_at <= CURRENT_TIMESTAMP').run();
    const row = this.database
      .prepare(
        `SELECT users.id, users.email, users.plan, users.stripe_customer_id,
                users.stripe_subscription_id, users.subscription_status,
                users.current_period_end, users.created_at
         FROM sessions JOIN users ON users.id = sessions.user_id
         WHERE sessions.token_hash = ? AND sessions.expires_at > CURRENT_TIMESTAMP`,
      )
      .get(tokenHash);
    return row ? mapUser(row) : undefined;
  }

  deleteSession(tokenHash: string): void {
    this.database.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
  }

  upgradeUser(userId: string, customerId: string | undefined, subscriptionId: string): UserAccount {
    this.database
      .prepare(
        `UPDATE users SET plan = 'pro', stripe_customer_id = COALESCE(?, stripe_customer_id),
                stripe_subscription_id = ?, subscription_status = 'active' WHERE id = ?`,
      )
      .run(customerId ?? null, subscriptionId, userId);
    return this.getUserById(userId)!;
  }

  updateSubscriptionByStripeReference(
    subscriptionId: string | undefined,
    customerId: string | undefined,
    status: string,
    currentPeriodEnd?: string,
  ): UserAccount | undefined {
    if (!subscriptionId && !customerId) return undefined;
    const row = subscriptionId
      ? this.database
          .prepare('SELECT id FROM users WHERE stripe_subscription_id = ?')
          .get(subscriptionId)
      : this.database.prepare('SELECT id FROM users WHERE stripe_customer_id = ?').get(customerId!);
    if (!row) return undefined;
    const userId = String(row.id);
    const active = ['active', 'trialing'].includes(status);
    this.database
      .prepare(
        `UPDATE users SET plan = ?, subscription_status = ?, current_period_end = COALESCE(?, current_period_end),
                stripe_customer_id = COALESCE(?, stripe_customer_id),
                stripe_subscription_id = COALESCE(?, stripe_subscription_id) WHERE id = ?`,
      )
      .run(
        active ? 'pro' : 'free',
        status,
        currentPeriodEnd ?? null,
        customerId ?? null,
        subscriptionId ?? null,
        userId,
      );
    return this.getUserById(userId);
  }

  addFavorite(asset: Asset, userId = 'guest'): Asset {
    this.database
      .prepare(
        `INSERT INTO user_favorites (user_id, asset_id, asset_json)
         VALUES (?, ?, ?)
         ON CONFLICT(user_id, asset_id) DO UPDATE SET asset_json = excluded.asset_json`,
      )
      .run(userId, asset.id, JSON.stringify(asset));
    return asset;
  }

  removeFavorite(assetId: string, userId = 'guest'): boolean {
    const result = this.database
      .prepare('DELETE FROM user_favorites WHERE user_id = ? AND asset_id = ?')
      .run(userId, assetId);
    return result.changes > 0;
  }

  listFavorites(userId = 'guest'): Asset[] {
    return this.database
      .prepare('SELECT asset_json FROM user_favorites WHERE user_id = ? ORDER BY created_at DESC')
      .all(userId)
      .flatMap((row) => {
        try {
          return [JSON.parse(String(row.asset_json)) as Asset];
        } catch {
          return [];
        }
      });
  }

  recordDownload(asset: Asset, userId = 'guest'): DownloadEntry {
    const result = this.database
      .prepare(
        'INSERT INTO user_downloads (user_id, asset_id, provider, title, url) VALUES (?, ?, ?, ?, ?)',
      )
      .run(userId, asset.id, asset.provider, asset.title, asset.contentUrl);
    const row = this.database
      .prepare(
        `SELECT id, asset_id, provider, title, url, created_at
         FROM user_downloads WHERE id = ?`,
      )
      .get(result.lastInsertRowid);
    return mapDownload(row);
  }

  listDownloads(limit = 50, userId = 'guest'): DownloadEntry[] {
    return this.database
      .prepare(
        `SELECT id, asset_id, provider, title, url, created_at
         FROM user_downloads WHERE user_id = ? ORDER BY id DESC LIMIT ?`,
      )
      .all(userId, limit)
      .map(mapDownload);
  }

  recordSearch(query: string, searchQuery: string, userId = 'guest'): void {
    this.database
      .prepare('INSERT INTO user_search_history (user_id, query, search_query) VALUES (?, ?, ?)')
      .run(userId, query, searchQuery);
  }

  listSearchHistory(limit = 20, userId = 'guest'): SearchHistoryEntry[] {
    return this.database
      .prepare(
        `SELECT id, query, search_query, created_at
         FROM user_search_history WHERE user_id = ? ORDER BY id DESC LIMIT ?`,
      )
      .all(userId, limit)
      .map((row) => ({
        id: Number(row.id),
        query: String(row.query),
        searchQuery: String(row.search_query),
        createdAt: String(row.created_at),
      }));
  }

  createProject(id: string, name: string, description: string, userId = 'guest'): Project {
    this.database
      .prepare('INSERT INTO user_projects (id, user_id, name, description) VALUES (?, ?, ?, ?)')
      .run(id, userId, name, description);
    return this.getProject(id, userId);
  }

  listProjects(userId = 'guest'): ProjectSummary[] {
    return this.database
      .prepare(
        `SELECT user_projects.id, user_projects.name, user_projects.description,
                user_projects.created_at, user_projects.updated_at,
                COUNT(user_project_assets.asset_id) AS asset_count
         FROM user_projects
         LEFT JOIN user_project_assets ON user_project_assets.project_id = user_projects.id
         WHERE user_projects.user_id = ?
         GROUP BY user_projects.id
         ORDER BY user_projects.updated_at DESC, user_projects.created_at DESC`,
      )
      .all(userId)
      .map(mapProjectSummary);
  }

  getProject(projectId: string, userId = 'guest'): Project {
    const row = this.database
      .prepare(
        `SELECT user_projects.id, user_projects.name, user_projects.description,
                user_projects.created_at, user_projects.updated_at,
                COUNT(user_project_assets.asset_id) AS asset_count
         FROM user_projects
         LEFT JOIN user_project_assets ON user_project_assets.project_id = user_projects.id
         WHERE user_projects.id = ? AND user_projects.user_id = ?
         GROUP BY user_projects.id`,
      )
      .get(projectId, userId);
    if (!row) throw new ProjectNotFoundError();
    const assets = this.database
      .prepare(
        `SELECT asset_json FROM user_project_assets
         WHERE project_id = ? ORDER BY created_at DESC`,
      )
      .all(projectId)
      .flatMap(parseAssetRow);
    return { ...mapProjectSummary(row), assets };
  }

  deleteProject(projectId: string, userId = 'guest'): boolean {
    return (
      this.database
        .prepare('DELETE FROM user_projects WHERE id = ? AND user_id = ?')
        .run(projectId, userId).changes > 0
    );
  }

  addProjectAsset(projectId: string, asset: Asset, userId = 'guest'): Project {
    this.touchProject(projectId, userId);
    this.database
      .prepare(
        `INSERT INTO user_project_assets (project_id, asset_id, asset_json)
         VALUES (?, ?, ?)
         ON CONFLICT(project_id, asset_id) DO UPDATE SET asset_json = excluded.asset_json`,
      )
      .run(projectId, asset.id, JSON.stringify(asset));
    return this.getProject(projectId, userId);
  }

  removeProjectAsset(projectId: string, assetId: string, userId = 'guest'): Project {
    this.touchProject(projectId, userId);
    this.database
      .prepare('DELETE FROM user_project_assets WHERE project_id = ? AND asset_id = ?')
      .run(projectId, assetId);
    return this.getProject(projectId, userId);
  }

  updateProject(projectId: string, name: string, description: string, userId = 'guest'): Project {
    const result = this.database
      .prepare(
        'UPDATE user_projects SET name = ?, description = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?',
      )
      .run(name, description, projectId, userId);
    if (result.changes === 0) throw new ProjectNotFoundError();
    return this.getProject(projectId, userId);
  }

  addProjectAssets(projectId: string, assets: Asset[], userId = 'guest'): Project {
    this.touchProject(projectId, userId);
    const statement = this.database.prepare(
      `INSERT INTO user_project_assets (project_id, asset_id, asset_json) VALUES (?, ?, ?)
       ON CONFLICT(project_id, asset_id) DO UPDATE SET asset_json = excluded.asset_json`,
    );
    for (const asset of assets) statement.run(projectId, asset.id, JSON.stringify(asset));
    return this.getProject(projectId, userId);
  }

  clearProjectAssets(projectId: string, userId = 'guest'): Project {
    this.touchProject(projectId, userId);
    this.database.prepare('DELETE FROM user_project_assets WHERE project_id = ?').run(projectId);
    return this.getProject(projectId, userId);
  }

  private touchProject(projectId: string, userId: string): void {
    const result = this.database
      .prepare(
        'UPDATE user_projects SET updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?',
      )
      .run(projectId, userId);
    if (result.changes === 0) throw new ProjectNotFoundError();
  }
}

export class ClipFlowDatabase {
  private readonly database: SqliteClipFlowDatabase | PostgresClipFlowDatabase;

  constructor(databasePath?: string) {
    const connectionString = databasePath ? undefined : process.env.DATABASE_URL?.trim();
    this.database = connectionString
      ? new PostgresClipFlowDatabase(connectionString)
      : new SqliteClipFlowDatabase(databasePath);
  }

  async ready(): Promise<void> {
    if (this.database instanceof PostgresClipFlowDatabase) await this.database.ready();
  }

  async createUser(
    id: string,
    email: string,
    passwordHash: string,
    passwordSalt: string,
  ): Promise<UserAccount> {
    return this.database.createUser(id, email, passwordHash, passwordSalt);
  }

  async getUserCredentialsByEmail(email: string): Promise<UserCredentials | undefined> {
    return this.database.getUserCredentialsByEmail(email);
  }

  async getUserById(userId: string): Promise<UserAccount | undefined> {
    return this.database.getUserById(userId);
  }

  async createSession(tokenHash: string, userId: string, expiresAt: string): Promise<void> {
    await this.database.createSession(tokenHash, userId, expiresAt);
  }

  async getUserBySession(tokenHash: string): Promise<UserAccount | undefined> {
    return this.database.getUserBySession(tokenHash);
  }

  async deleteSession(tokenHash: string): Promise<void> {
    await this.database.deleteSession(tokenHash);
  }

  async upgradeUser(
    userId: string,
    customerId: string | undefined,
    subscriptionId: string,
  ): Promise<UserAccount> {
    return this.database.upgradeUser(userId, customerId, subscriptionId);
  }

  async updateSubscriptionByStripeReference(
    subscriptionId: string | undefined,
    customerId: string | undefined,
    status: string,
    currentPeriodEnd?: string,
  ): Promise<UserAccount | undefined> {
    return this.database.updateSubscriptionByStripeReference(
      subscriptionId,
      customerId,
      status,
      currentPeriodEnd,
    );
  }

  async addFavorite(asset: Asset, userId = 'guest'): Promise<Asset> {
    return this.database.addFavorite(asset, userId);
  }

  async removeFavorite(assetId: string, userId = 'guest'): Promise<boolean> {
    return this.database.removeFavorite(assetId, userId);
  }

  async listFavorites(userId = 'guest'): Promise<Asset[]> {
    return this.database.listFavorites(userId);
  }

  async recordDownload(asset: Asset, userId = 'guest'): Promise<DownloadEntry> {
    return this.database.recordDownload(asset, userId);
  }

  async listDownloads(limit = 50, userId = 'guest'): Promise<DownloadEntry[]> {
    return this.database.listDownloads(limit, userId);
  }

  async recordSearch(query: string, searchQuery: string, userId = 'guest'): Promise<void> {
    await this.database.recordSearch(query, searchQuery, userId);
  }

  async listSearchHistory(limit = 20, userId = 'guest'): Promise<SearchHistoryEntry[]> {
    return this.database.listSearchHistory(limit, userId);
  }

  async createProject(
    id: string,
    name: string,
    description: string,
    userId = 'guest',
  ): Promise<Project> {
    return this.database.createProject(id, name, description, userId);
  }

  async listProjects(userId = 'guest'): Promise<ProjectSummary[]> {
    return this.database.listProjects(userId);
  }

  async getProject(projectId: string, userId = 'guest'): Promise<Project> {
    return this.database.getProject(projectId, userId);
  }

  async deleteProject(projectId: string, userId = 'guest'): Promise<boolean> {
    return this.database.deleteProject(projectId, userId);
  }

  async addProjectAsset(projectId: string, asset: Asset, userId = 'guest'): Promise<Project> {
    return this.database.addProjectAsset(projectId, asset, userId);
  }

  async removeProjectAsset(
    projectId: string,
    assetId: string,
    userId = 'guest',
  ): Promise<Project> {
    return this.database.removeProjectAsset(projectId, assetId, userId);
  }

  async updateProject(
    projectId: string,
    name: string,
    description: string,
    userId = 'guest',
  ): Promise<Project> {
    return this.database.updateProject(projectId, name, description, userId);
  }

  async addProjectAssets(projectId: string, assets: Asset[], userId = 'guest'): Promise<Project> {
    return this.database.addProjectAssets(projectId, assets, userId);
  }

  async clearProjectAssets(projectId: string, userId = 'guest'): Promise<Project> {
    return this.database.clearProjectAssets(projectId, userId);
  }
}

function parseAssetRow(row: Record<string, unknown>): Asset[] {
  try {
    return [JSON.parse(String(row.asset_json)) as Asset];
  } catch {
    return [];
  }
}

function mapProjectSummary(row: Record<string, unknown>): ProjectSummary {
  return {
    id: String(row.id),
    name: String(row.name),
    description: String(row.description),
    assetCount: Number(row.asset_count),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapDownload(row: Record<string, unknown> | undefined): DownloadEntry {
  if (!row) throw new Error('下载记录写入失败');
  return {
    id: Number(row.id),
    assetId: String(row.asset_id),
    provider: String(row.provider),
    title: String(row.title),
    url: String(row.url),
    createdAt: String(row.created_at),
  };
}

function mapUser(row: Record<string, unknown>): UserAccount {
  return {
    id: String(row.id),
    email: String(row.email),
    plan: row.plan === 'pro' ? 'pro' : 'free',
    ...(row.stripe_customer_id ? { stripeCustomerId: String(row.stripe_customer_id) } : {}),
    ...(row.stripe_subscription_id
      ? { stripeSubscriptionId: String(row.stripe_subscription_id) }
      : {}),
    subscriptionStatus: row.subscription_status ? String(row.subscription_status) : 'inactive',
    ...(row.current_period_end ? { currentPeriodEnd: String(row.current_period_end) } : {}),
    createdAt: String(row.created_at),
  };
}

function mapUserCredentials(row: Record<string, unknown>): UserCredentials {
  return {
    ...mapUser(row),
    passwordHash: String(row.password_hash),
    passwordSalt: String(row.password_salt),
  };
}
