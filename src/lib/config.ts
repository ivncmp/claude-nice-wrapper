import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import type { AppConfig } from "./types.js";

const DATA_DIR = join(homedir(), ".claude-wrapper");

const DEFAULT_CONFIG: AppConfig = {
  memory: {
    autoInject: true,
    defaultKeys: [],
    maxInjectionChars: 4000,
  },
  life: {
    autoInject: true,
    dir: "",
    maxInjectionChars: 12000,
  },
  history: {
    maxEntries: 1000,
  },
  defaults: {},
};

export function getDataDir(): string {
  return DATA_DIR;
}

export async function ensureDataDir(): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
  await mkdir(join(DATA_DIR, "memory"), { recursive: true });
  await mkdir(join(DATA_DIR, "templates"), { recursive: true });
}

export async function loadConfig(): Promise<AppConfig> {
  try {
    const raw = await readFile(join(DATA_DIR, "config.json"), "utf-8");
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_CONFIG, ...parsed };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export async function saveConfig(config: AppConfig): Promise<void> {
  await ensureDataDir();
  await writeFile(
    join(DATA_DIR, "config.json"),
    JSON.stringify(config, null, 2) + "\n",
    "utf-8"
  );
}

export async function getConfigValue(key: string): Promise<unknown> {
  const config = await loadConfig();
  const parts = key.split(".");
  let current: unknown = config;
  for (const part of parts) {
    if (current && typeof current === "object" && part in current) {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return current;
}

export async function setConfigValue(key: string, value: string): Promise<void> {
  const config = await loadConfig();
  const parts = key.split(".");
  let current: Record<string, unknown> = config as unknown as Record<string, unknown>;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!(parts[i] in current) || typeof current[parts[i]] !== "object") {
      current[parts[i]] = {};
    }
    current = current[parts[i]] as Record<string, unknown>;
  }

  // Try to parse as number or boolean
  let parsed: unknown = value;
  if (value === "true") parsed = true;
  else if (value === "false") parsed = false;
  else if (!isNaN(Number(value)) && value !== "") parsed = Number(value);

  current[parts[parts.length - 1]] = parsed;
  await saveConfig(config);
}
