import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { getDataDir } from "./config.js";

interface SessionState {
  [sessionId: string]: {
    totalTokens: number;
    updatedAt: string;
  };
}

function getStateFile(): string {
  return join(getDataDir(), "session-state.json");
}

async function loadState(): Promise<SessionState> {
  try {
    const raw = await readFile(getStateFile(), "utf-8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function saveState(state: SessionState): Promise<void> {
  await writeFile(getStateFile(), JSON.stringify(state, null, 2), "utf-8");
}

export async function getSessionTokens(sessionId: string): Promise<number> {
  const state = await loadState();
  return state[sessionId]?.totalTokens ?? 0;
}

export async function updateSessionTokens(sessionId: string, totalTokens: number): Promise<void> {
  const state = await loadState();
  state[sessionId] = { totalTokens, updatedAt: new Date().toISOString() };
  await saveState(state);
}
