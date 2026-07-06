import { storage } from 'wxt/storage';

// ── Reading Progress ──────────────────────────────

export interface ReadingProgressSnapshot {
  ratio: number;
  layout: 'single' | 'double' | 'page';
  updatedAt: number;
}

/** Per-URL reading position: keyed by location origin+pathname+search+hash */
export function getProgressStorageKey(location: Location): string {
  return `readmd-progress:${location.origin}${location.pathname}${location.search}${location.hash}`;
}

export function createProgressStorage(key: string) {
  return storage.defineItem<ReadingProgressSnapshot>(`local:${key}`);
}

// ── App Preferences ───────────────────────────────

export type Theme =
  | 'light'
  | 'yellow'
  | 'green'
  | 'purple'
  | 'gray'
  | 'blue'
  | 'dark'
  | 'dark-purple'
  | 'dark-gray'
  | 'dark-blue';

export type Layout = 'single' | 'double';

export type PenTool = 'pen' | 'eraser' | 'text' | 'highlight' | 'none';

export const theme = storage.defineItem<Theme>('sync:theme', {
  defaultValue: 'light',
});

export const layout = storage.defineItem<Layout>('sync:layout', {
  defaultValue: 'single',
});

export const fontSize = storage.defineItem<number>('sync:fontSize', {
  defaultValue: 16,
});

export const penColor = storage.defineItem<string>('sync:penColor', {
  defaultValue: '#e74c3c99',
});

export const penSize = storage.defineItem<number>('sync:penSize', {
  defaultValue: 8,
});

export const penOpacity = storage.defineItem<number>('sync:penOpacity', {
  defaultValue: 100,
});

export const penTool = storage.defineItem<PenTool>('sync:penTool', {
  defaultValue: 'pen',
});

export const readerMode = storage.defineItem<boolean>('sync:readerMode', {
  defaultValue: false,
});

export const annotateMode = storage.defineItem<boolean>('sync:annotateMode', {
  defaultValue: false,
});
