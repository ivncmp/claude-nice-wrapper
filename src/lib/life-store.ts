import { readFile, readdir, stat } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";
import { homedir } from "node:os";
import { loadConfig } from "./config.js";

const execFileAsync = promisify(execFile);

const SEARCH_SCRIPT = join(
  homedir(),
  ".openclaw",
  "workspace",
  "scripts",
  "search_facts.py"
);

function getLifeDir(): string {
  return join(homedir(), "life");
}

interface LifeEntity {
  name: string;
  collection: string; // "projects", "areas/people", etc.
  summaryPath: string;
}

interface SearchResult {
  entity: string;
  entity_type: string;
  score: number;
  fact: string;
  fact_id: string;
  category: string;
}

/**
 * Calls search_facts.py to find entities relevant to the query.
 * Returns unique entity names ranked by relevance.
 */
async function searchRelevantEntities(
  query: string,
  limit: number = 10
): Promise<{ entities: string[]; facts: SearchResult[] }> {
  const { stdout } = await execFileAsync("python3", [
    SEARCH_SCRIPT,
    query,
    "--json",
    "--limit",
    String(limit),
  ]);

  const results: SearchResult[] = JSON.parse(stdout);

  // Deduplicate entity names preserving rank order
  const seen = new Set<string>();
  const entities: string[] = [];
  for (const r of results) {
    if (!seen.has(r.entity)) {
      seen.add(r.entity);
      entities.push(r.entity);
    }
  }

  return { entities, facts: results };
}

async function discoverEntities(lifeDir: string): Promise<LifeEntity[]> {
  const entities: LifeEntity[] = [];

  async function scanDir(dir: string, collection: string): Promise<void> {
    let entries: string[];
    try {
      entries = await readdir(dir);
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = join(dir, entry);
      const summaryPath = join(fullPath, "summary.md");

      try {
        await stat(summaryPath);
        entities.push({
          name: entry,
          collection,
          summaryPath,
        });
      } catch {
        // No summary.md — check if it's a nested directory (e.g. areas/people/, areas/systems/)
        try {
          const s = await stat(fullPath);
          if (s.isDirectory()) {
            await scanDir(fullPath, `${collection}/${entry}`);
          }
        } catch {
          // skip
        }
      }
    }
  }

  for (const topLevel of ["projects", "areas", "resources"]) {
    await scanDir(join(lifeDir, topLevel), topLevel);
  }

  return entities;
}

export async function buildLifeContext(
  query?: string,
  maxChars?: number
): Promise<string> {
  const config = await loadConfig();
  const limit = maxChars ?? config.life.maxInjectionChars;
  const lifeDir = config.life.dir || getLifeDir();

  // If we have a query, use PARA search for targeted context
  if (query) {
    try {
      return await buildSearchedLifeContext(query, lifeDir, limit);
    } catch {
      // Fall through to full scan if search fails
    }
  }

  // Fallback: full scan (no query, or search failed)
  return await buildFullLifeContext(lifeDir, limit);
}

/**
 * Targeted context: search for relevant entities and inject only their summaries + top facts.
 */
async function buildSearchedLifeContext(
  query: string,
  lifeDir: string,
  limit: number
): Promise<string> {
  const { entities: relevantNames, facts } =
    await searchRelevantEntities(query);

  if (relevantNames.length === 0) return "";

  // Discover all entities so we can map names to summary paths
  const allEntities = await discoverEntities(lifeDir);
  const entityMap = new Map<string, LifeEntity>();
  for (const e of allEntities) {
    entityMap.set(e.name, e);
  }

  const parts: string[] = [];
  let totalChars = 0;

  // Inject summaries of relevant entities
  for (const name of relevantNames) {
    const entity = entityMap.get(name);
    if (!entity) continue;

    try {
      const content = await readFile(entity.summaryPath, "utf-8");
      const trimmed =
        content.length > 1500
          ? content.slice(0, 1500) + "\n...(truncated)"
          : content;

      const section = `## [${entity.collection}] ${entity.name}\n${trimmed}`;
      if (totalChars + section.length > limit) break;

      parts.push(section);
      totalChars += section.length;
    } catch {
      // skip unreadable
    }
  }

  // Append top relevant facts as quick-reference
  const topFacts = facts.slice(0, 15);
  if (topFacts.length > 0) {
    const factsSection = `## Relevant Facts\n${topFacts
      .map((f) => `- [${f.entity}] ${f.fact}`)
      .join("\n")}`;

    if (totalChars + factsSection.length <= limit) {
      parts.push(factsSection);
    }
  }

  if (parts.length === 0) return "";

  return `You have the following life/PARA knowledge context relevant to this query:\n\n${parts.join("\n\n")}`;
}

/**
 * Full scan fallback: read all summaries up to char limit (original behavior).
 */
async function buildFullLifeContext(
  lifeDir: string,
  limit: number
): Promise<string> {
  const entities = await discoverEntities(lifeDir);
  if (entities.length === 0) return "";

  const parts: string[] = [];
  let totalChars = 0;

  // Read index.md first as overview
  try {
    const index = await readFile(join(lifeDir, "index.md"), "utf-8");
    const section = `## Life Overview\n${index}`;
    if (section.length <= limit) {
      parts.push(section);
      totalChars += section.length;
    }
  } catch {
    // no index.md
  }

  for (const entity of entities) {
    try {
      const content = await readFile(entity.summaryPath, "utf-8");
      const trimmed =
        content.length > 1500
          ? content.slice(0, 1500) + "\n...(truncated)"
          : content;

      const section = `## [${entity.collection}] ${entity.name}\n${trimmed}`;
      if (totalChars + section.length > limit) break;

      parts.push(section);
      totalChars += section.length;
    } catch {
      // skip unreadable
    }
  }

  if (parts.length === 0) return "";

  return `You have the following life/PARA knowledge context about the user:\n\n${parts.join("\n\n")}`;
}

export async function listLifeEntities(): Promise<LifeEntity[]> {
  const config = await loadConfig();
  const lifeDir = config.life.dir || getLifeDir();
  return discoverEntities(lifeDir);
}
