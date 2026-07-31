import type { Asset } from '@clipflow/providers';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

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

export class ClipFlowDatabase {
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
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS sessions (
        token_hash TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
    `);
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
                stripe_customer_id, stripe_subscription_id, created_at
         FROM users WHERE email = ?`,
      )
      .get(email);
    return row ? mapUserCredentials(row) : undefined;
  }

  getUserById(userId: string): UserAccount | undefined {
    const row = this.database
      .prepare(
        `SELECT id, email, plan, stripe_customer_id, stripe_subscription_id, created_at
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
                users.stripe_subscription_id, users.created_at
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
                stripe_subscription_id = ? WHERE id = ?`,
      )
      .run(customerId ?? null, subscriptionId, userId);
    return this.getUserById(userId)!;
  }

  addFavorite(asset: Asset): Asset {
    this.database
      .prepare(
        `INSERT INTO favorites (id, asset_json)
         VALUES (?, ?)
         ON CONFLICT(id) DO UPDATE SET asset_json = excluded.asset_json`,
      )
      .run(asset.id, JSON.stringify(asset));
    return asset;
  }

  removeFavorite(assetId: string): boolean {
    const result = this.database.prepare('DELETE FROM favorites WHERE id = ?').run(assetId);
    return result.changes > 0;
  }

  listFavorites(): Asset[] {
    return this.database
      .prepare('SELECT asset_json FROM favorites ORDER BY created_at DESC')
      .all()
      .flatMap((row) => {
        try {
          return [JSON.parse(String(row.asset_json)) as Asset];
        } catch {
          return [];
        }
      });
  }

  recordDownload(asset: Asset): DownloadEntry {
    const result = this.database
      .prepare('INSERT INTO downloads (asset_id, provider, title, url) VALUES (?, ?, ?, ?)')
      .run(asset.id, asset.provider, asset.title, asset.contentUrl);
    const row = this.database
      .prepare(
        `SELECT id, asset_id, provider, title, url, created_at
         FROM downloads WHERE id = ?`,
      )
      .get(result.lastInsertRowid);
    return mapDownload(row);
  }

  listDownloads(limit = 50): DownloadEntry[] {
    return this.database
      .prepare(
        `SELECT id, asset_id, provider, title, url, created_at
         FROM downloads ORDER BY id DESC LIMIT ?`,
      )
      .all(limit)
      .map(mapDownload);
  }

  recordSearch(query: string, searchQuery: string): void {
    this.database
      .prepare('INSERT INTO search_history (query, search_query) VALUES (?, ?)')
      .run(query, searchQuery);
  }

  listSearchHistory(limit = 20): SearchHistoryEntry[] {
    return this.database
      .prepare(
        `SELECT id, query, search_query, created_at
         FROM search_history ORDER BY id DESC LIMIT ?`,
      )
      .all(limit)
      .map((row) => ({
        id: Number(row.id),
        query: String(row.query),
        searchQuery: String(row.search_query),
        createdAt: String(row.created_at),
      }));
  }

  createProject(id: string, name: string, description: string): Project {
    this.database
      .prepare('INSERT INTO projects (id, name, description) VALUES (?, ?, ?)')
      .run(id, name, description);
    return this.getProject(id);
  }

  listProjects(): ProjectSummary[] {
    return this.database
      .prepare(
        `SELECT projects.id, projects.name, projects.description,
                projects.created_at, projects.updated_at,
                COUNT(project_assets.asset_id) AS asset_count
         FROM projects
         LEFT JOIN project_assets ON project_assets.project_id = projects.id
         GROUP BY projects.id
         ORDER BY projects.updated_at DESC, projects.created_at DESC`,
      )
      .all()
      .map(mapProjectSummary);
  }

  getProject(projectId: string): Project {
    const row = this.database
      .prepare(
        `SELECT projects.id, projects.name, projects.description,
                projects.created_at, projects.updated_at,
                COUNT(project_assets.asset_id) AS asset_count
         FROM projects
         LEFT JOIN project_assets ON project_assets.project_id = projects.id
         WHERE projects.id = ?
         GROUP BY projects.id`,
      )
      .get(projectId);
    if (!row) throw new ProjectNotFoundError();
    const assets = this.database
      .prepare(
        `SELECT asset_json FROM project_assets
         WHERE project_id = ? ORDER BY created_at DESC`,
      )
      .all(projectId)
      .flatMap(parseAssetRow);
    return { ...mapProjectSummary(row), assets };
  }

  deleteProject(projectId: string): boolean {
    return this.database.prepare('DELETE FROM projects WHERE id = ?').run(projectId).changes > 0;
  }

  addProjectAsset(projectId: string, asset: Asset): Project {
    this.touchProject(projectId);
    this.database
      .prepare(
        `INSERT INTO project_assets (project_id, asset_id, asset_json)
         VALUES (?, ?, ?)
         ON CONFLICT(project_id, asset_id) DO UPDATE SET asset_json = excluded.asset_json`,
      )
      .run(projectId, asset.id, JSON.stringify(asset));
    return this.getProject(projectId);
  }

  removeProjectAsset(projectId: string, assetId: string): Project {
    this.database
      .prepare('DELETE FROM project_assets WHERE project_id = ? AND asset_id = ?')
      .run(projectId, assetId);
    this.touchProject(projectId);
    return this.getProject(projectId);
  }

  private touchProject(projectId: string): void {
    const result = this.database
      .prepare('UPDATE projects SET updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(projectId);
    if (result.changes === 0) throw new ProjectNotFoundError();
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
