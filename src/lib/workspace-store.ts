import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";

// Files to inject, in priority order. Adjust paths or add/remove as needed.
const WORKSPACE_DIR = join(homedir(), ".openclaw", "workspace");

const BOOTSTRAP_FILES = [
  { file: "IDENTITY.md", header: "## Identity" },
  { file: "SOUL.md",     header: "## Soul / Personality" },
  { file: "USER.md",     header: "## User Profile" },
  { file: "MEMORY.md",   header: "## System Memory" },
];

export async function buildWorkspaceContext(maxChars = 16000): Promise<string> {
  const parts: string[] = [];
  let totalChars = 0;

  for (const { file, header } of BOOTSTRAP_FILES) {
    try {
      const content = (await readFile(join(WORKSPACE_DIR, file), "utf-8")).trim();
      if (!content) continue;

      const section = `${header}\n\n${content}`;
      if (totalChars + section.length > maxChars) break;

      parts.push(section);
      totalChars += section.length;
    } catch {
      // file missing or unreadable — skip
    }
  }

  if (parts.length === 0) return "";
  return parts.join("\n\n---\n\n");
}
