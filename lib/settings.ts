import { DEFAULT_SYSTEM_PROMPT } from './prompt';

export const EFFORTS = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh'] as const;
type Effort = (typeof EFFORTS)[number];

export interface Settings {
  apiKey: string;
  kagiApiKey: string;
  model: string;
  effort: Effort;
  systemPrompt: string;
  extractCount: number;
  budgetMs: number;
  snippetCount: number;
  maxSearchQueries: number;
  searchResultCount: number;
  searchExtractCount: number;
}

export const DEFAULT_SETTINGS: Settings = {
  apiKey: '',
  kagiApiKey: '',
  model: 'anthropic/claude-sonnet-5.5',
  effort: 'medium',
  systemPrompt: DEFAULT_SYSTEM_PROMPT,
  extractCount: 5,
  budgetMs: 2500,
  snippetCount: 20,
  maxSearchQueries: 3,
  searchResultCount: 8,
  searchExtractCount: 3,
};
