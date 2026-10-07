import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

const dbDir = path.resolve(process.cwd(), 'data');
fs.mkdirSync(dbDir, { recursive: true });

export const db = new Database(path.join(dbDir, 'viral-radar.db'));

db.pragma('journal_mode = WAL');

export function initializeDatabase(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS stories (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      summary TEXT NOT NULL,
      source TEXT NOT NULL,
      countries TEXT NOT NULL,
      country_count INTEGER NOT NULL,
      score REAL NOT NULL,
      phase TEXT NOT NULL,
      url TEXT,
      first_seen_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
}
