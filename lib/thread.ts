import type { Source, Turn } from './messages';

export interface Thread {
  sources: Source[];
  turns: Turn[];
}

const key = (query: string) => `kqa:thread:${query}`;

export function loadThread(query: string): Thread | undefined {
  try {
    return JSON.parse(sessionStorage.getItem(key(query)) ?? 'null') ?? undefined;
  } catch {
    return undefined;
  }
}

export function saveThread(query: string, thread: Thread): void {
  try {
    sessionStorage.setItem(key(query), JSON.stringify(thread));
  } catch {
    // Storage full or blocked; the thread just won't survive a reload.
  }
}
