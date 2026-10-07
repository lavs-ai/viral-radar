import { db, initializeDatabase } from './index.js';
import type { StoryPhase, StoryRecord } from '../types.js';

function toStoryRecord(row: Record<string, unknown>): StoryRecord {
  return {
    id: String(row.id),
    title: String(row.title),
    summary: String(row.summary),
    source: String(row.source),
    countries: Array.isArray(row.countries) ? row.countries.map(String) : JSON.parse(String(row.countries ?? '[]')),
    countryCount: Number(row.country_count ?? 0),
    score: Number(row.score ?? 0),
    phase: String(row.phase) as StoryPhase,
    url: row.url ? String(row.url) : undefined,
    firstSeenAt: String(row.first_seen_at),
    lastSeenAt: String(row.last_seen_at),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export function listStories(limit = 20): StoryRecord[] {
  const rows = db.prepare(
    `SELECT * FROM stories ORDER BY last_seen_at DESC LIMIT ?`
  ).all(limit) as Record<string, unknown>[];

  return rows.map(toStoryRecord);
}

export function getTrendingStories(limit = 10): StoryRecord[] {
  const rows = db.prepare(
    `SELECT * FROM stories ORDER BY country_count DESC, score DESC, last_seen_at DESC LIMIT ?`
  ).all(limit) as Record<string, unknown>[];

  return rows.map(toStoryRecord);
}

export function getStoryById(id: string): StoryRecord | null {
  const row = db.prepare(`SELECT * FROM stories WHERE id = ?`).get(id) as Record<string, unknown> | undefined;
  return row ? toStoryRecord(row) : null;
}

export function saveStories(stories: StoryRecord[]): void {
  const insert = db.prepare(`
    INSERT OR REPLACE INTO stories (
      id, title, summary, source, countries, country_count, score, phase, url,
      first_seen_at, last_seen_at, created_at, updated_at
    ) VALUES (
      @id, @title, @summary, @source, @countries, @countryCount, @score, @phase, @url,
      @firstSeenAt, @lastSeenAt, @createdAt, @updatedAt
    )
  `);

  const transaction = db.transaction((items: StoryRecord[]) => {
    for (const story of items) {
      insert.run({
        id: story.id,
        title: story.title,
        summary: story.summary,
        source: story.source,
        countries: JSON.stringify(story.countries),
        countryCount: story.countryCount,
        score: story.score,
        phase: story.phase,
        url: story.url ?? null,
        firstSeenAt: story.firstSeenAt,
        lastSeenAt: story.lastSeenAt,
        createdAt: story.createdAt,
        updatedAt: story.updatedAt,
      });
    }
  });

  transaction(stories);
}

export function seedSampleStories(): void {
  initializeDatabase();

  const count = db.prepare('SELECT COUNT(*) as count FROM stories').get() as { count: number };
  if (count.count > 0) return;

  const now = new Date().toISOString();
  const stories: StoryRecord[] = [
    {
      id: 'story-1',
      title: 'Regional security talks accelerate after cross-border pressure',
      summary: 'Diplomatic talks are spreading across multiple countries as officials attempt to reach a rapid framework agreement.',
      source: 'google-news',
      countries: ['US', 'UK', 'FR', 'DE', 'IN'],
      countryCount: 5,
      score: 92,
      phase: 'SPREADING',
      url: 'https://example.com/stories/security-talks',
      firstSeenAt: now,
      lastSeenAt: now,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'story-2',
      title: 'Energy infrastructure update draws attention across major markets',
      summary: 'Investors and government officials are watching a new infrastructure update as it moves through several countries at once.',
      source: 'bluesky',
      countries: ['US', 'AU', 'JP', 'DE'],
      countryCount: 4,
      score: 76,
      phase: 'BREAKING',
      url: 'https://example.com/stories/energy-update',
      firstSeenAt: now,
      lastSeenAt: now,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'story-3',
      title: 'Technology regulation discussion reaches wider audience',
      summary: 'Regulatory attention is widening as more countries debate how to respond to the latest change in digital policy.',
      source: 'reddit',
      countries: ['US', 'CA', 'GB', 'SG'],
      countryCount: 4,
      score: 68,
      phase: 'GLOBAL',
      url: 'https://example.com/stories/tech-regulation',
      firstSeenAt: now,
      lastSeenAt: now,
      createdAt: now,
      updatedAt: now,
    },
  ];

  saveStories(stories);
}
