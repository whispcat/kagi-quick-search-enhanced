export const TRIGGER_EVENT = 'kqa:trigger';
export const PORT_NAME = 'kqa';

/** Search result as Kagi sends it to its own quick answer endpoint. */
export interface KagiItem {
  title: string;
  url: string;
  snippet: string;
  rank: number;
  source: string;
}

export interface Source {
  n: number;
  title: string;
  url: string;
  domain: string;
  snippet: string;
  content?: string;
  /** Turn whose web searches found this source; absent for the page's own results. */
  turn?: number;
}

export interface Turn {
  question: string;
  answer: string;
  searches?: string[];
}

export interface AskRequest {
  question: string;
  history: Turn[];
  items?: KagiItem[];
  sources?: Source[];
  lens?: string;
}

export type AskEvent =
  | { type: 'status'; status: 'reading' | 'thinking' }
  | { type: 'search'; query: string }
  | { type: 'sources'; sources: Source[] }
  | { type: 'delta'; text: string }
  | { type: 'done' }
  | { type: 'error'; message: string; missingKey?: boolean };

export type RuntimeMessage =
  | { type: 'extract'; html: string; url: string }
  | { type: 'open-options' };
