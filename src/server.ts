import type { Express, Request, Response } from 'express';
import { getStoryById, getTrendingStories, listStories } from '../db/stories.js';

export function registerApiRoutes(app: Express): void {
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({
      ok: true,
      service: 'viral-radar',
      time: new Date().toISOString(),
    });
  });

  app.get('/api/trending', (_req: Request, res: Response) => {
    const stories = getTrendingStories(10);
    res.json(stories);
  });

  app.get('/api/stories', (_req: Request, res: Response) => {
    const stories = listStories(20);
    res.json(stories);
  });

  app.get('/api/stories/:id', (req: Request, res: Response) => {
    const story = getStoryById(req.params.id);
    if (!story) {
      res.status(404).json({ error: 'Story not found' });
      return;
    }

    res.json(story);
  });
}
