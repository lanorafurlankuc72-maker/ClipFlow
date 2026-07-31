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
    `);
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
