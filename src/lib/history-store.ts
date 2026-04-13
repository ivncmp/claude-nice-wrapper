import { randomUUID } from 'node:crypto';
import { appendFile, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { getDataDir, ensureDataDir, loadConfig } from './config.js';
import type { HistoryEntry } from './types.js';

function getHistoryPath(): string {
  return join(getDataDir(), 'history.jsonl');
}

export async function addHistoryEntry(
  entry: Omit<HistoryEntry, 'id' | 'timestamp'>,
): Promise<HistoryEntry> {
  await ensureDataDir();
  const full: HistoryEntry = {
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    ...entry,
  };
  await appendFile(getHistoryPath(), JSON.stringify(full) + '\n', 'utf-8');

  // Enforce history.maxEntries
  try {
    const config = await loadConfig();
    const maxEntries = config.history.maxEntries;
    if (maxEntries > 0) {
      const all = await readLines();
      if (all.length > maxEntries) {
        const kept = all.slice(-maxEntries);
        await writeFile(
          getHistoryPath(),
          kept.map((e) => JSON.stringify(e)).join('\n') + '\n',
          'utf-8',
        );
      }
    }
  } catch (err) {
    // pruning is best-effort — log if debug enabled
    const cfg = await loadConfig();
    if (cfg.debug) console.error('[cw debug] history pruning failed:', err);
  }

  return full;
}

export async function listHistory(limit = 20): Promise<HistoryEntry[]> {
  const lines = await readLines();
  return lines.slice(-limit).reverse();
}

export async function getHistoryEntry(id: string): Promise<HistoryEntry | null> {
  const lines = await readLines();
  return lines.find((e) => e.id === id || e.id.startsWith(id)) ?? null;
}

export async function searchHistory(query: string): Promise<HistoryEntry[]> {
  const lines = await readLines();
  const lower = query.toLowerCase();
  return lines
    .filter((e) => e.prompt.toLowerCase().includes(lower) || e.result.toLowerCase().includes(lower))
    .reverse();
}

export async function clearHistory(before?: string): Promise<number> {
  const lines = await readLines();
  if (!before) {
    await writeFile(getHistoryPath(), '', 'utf-8');
    return lines.length;
  }
  const cutoff = new Date(before).getTime();
  if (isNaN(cutoff)) throw new Error(`Invalid date: "${before}"`);
  const kept = lines.filter((e) => new Date(e.timestamp).getTime() >= cutoff);
  const removed = lines.length - kept.length;
  await writeFile(
    getHistoryPath(),
    kept.map((e) => JSON.stringify(e)).join('\n') + (kept.length ? '\n' : ''),
    'utf-8',
  );
  return removed;
}

async function readLines(): Promise<HistoryEntry[]> {
  try {
    const content = await readFile(getHistoryPath(), 'utf-8');
    return content
      .split('\n')
      .filter((line) => line.trim())
      .flatMap((line) => {
        try {
          return [JSON.parse(line) as HistoryEntry];
        } catch {
          return [];
        }
      });
  } catch {
    return [];
  }
}
