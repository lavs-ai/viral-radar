export type StoryPhase = 'BREAKING' | 'SPREADING' | 'GLOBAL' | 'FADING' | 'SIGNAL' | 'CONFIRMED';

export type StoryRecord = {
  id: string;
  title: string;
  summary: string;
  source: string;
  countries: string[];
  countryCount: number;
  score: number;
  phase: StoryPhase;
  url?: string;
  firstSeenAt: string;
  lastSeenAt: string;
  createdAt: string;
  updatedAt: string;
};
