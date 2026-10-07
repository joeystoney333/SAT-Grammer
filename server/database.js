import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export const emptyProgress = () => ({
  attempts: [],
  completedLessons: [],
  bookmarks: [],
  rushRuns: [],
});

/** Open a persistent store, or use :memory: for an isolated test. */
export function openDatabase(filename) {
  if (filename !== ':memory:') mkdirSync(dirname(filename), { recursive: true });
  const database = new DatabaseSync(filename);
  database.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);
    CREATE TABLE IF NOT EXISTS progress (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      data TEXT NOT NULL
    );
  `);
  return database;
}

export function readProgress(database, userId) {
  const row = database.prepare('SELECT data FROM progress WHERE user_id = ?').get(userId);
  return row ? JSON.parse(row.data) : emptyProgress();
}

const mergeById = (existing, incoming, timeField) => {
  const records = new Map(existing.map((item) => [item.id, item]));
  for (const item of incoming) if (!records.has(item.id)) records.set(item.id, item);
  return [...records.values()].sort((a, b) => a[timeField].localeCompare(b[timeField]) || a.id.localeCompare(b.id));
};

/** Merge immutable events atomically, so stale devices cannot erase another device's work. */
export function mergeProgress(database, userId, incoming, removedBookmarks = [], addedBookmarks) {
  database.exec('BEGIN IMMEDIATE');
  try {
    const existing = readProgress(database, userId);
    const removed = new Set(removedBookmarks);
    const merged = {
      attempts: mergeById(existing.attempts, incoming.attempts, 'answeredAt'),
      completedLessons: [...new Set([...existing.completedLessons, ...incoming.completedLessons])],
      bookmarks: [...new Set([...existing.bookmarks, ...(addedBookmarks ?? incoming.bookmarks)])].filter((id) => !removed.has(id)),
      rushRuns: mergeById(existing.rushRuns, incoming.rushRuns, 'finishedAt'),
    };
    if (merged.attempts.length > 50000 || merged.rushRuns.length > 10000) {
      const error = new Error('Your history is full. Please contact support before adding more records.');
      error.status = 413;
      throw error;
    }
    database.prepare(`INSERT INTO progress (user_id, data) VALUES (?, ?)
      ON CONFLICT(user_id) DO UPDATE SET data = excluded.data`).run(userId, JSON.stringify(merged));
    database.exec('COMMIT');
    return merged;
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
}
