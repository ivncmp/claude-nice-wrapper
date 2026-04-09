import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";

interface HistoryMessage {
  role: "user" | "assistant";
  text: string;
  timestamp: string;
}

async function getMostRecentSessionFile(sessionsDir: string): Promise<string | null> {
  try {
    const files = await readdir(sessionsDir);
    const jsonlFiles = files.filter(f => f.endsWith(".jsonl") && !f.includes(".deleted") && !f.includes(".reset"));
    if (jsonlFiles.length === 0) return null;

    const withMtime = await Promise.all(
      jsonlFiles.map(async f => {
        const s = await stat(join(sessionsDir, f));
        return { file: f, mtime: s.mtimeMs };
      })
    );
    withMtime.sort((a, b) => b.mtime - a.mtime);
    return join(sessionsDir, withMtime[0].file);
  } catch {
    return null;
  }
}

function extractText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((c: unknown) => (c as Record<string, unknown>)?.type === "text")
      .map((c: unknown) => (c as Record<string, unknown>)?.text as string ?? "")
      .join(" ");
  }
  return "";
}

export async function buildRecentHistoryContext(
  sessionsDir: string,
  windowHours: number = 2,
  maxChars: number = 3000
): Promise<string> {
  const sessionFile = await getMostRecentSessionFile(sessionsDir);
  if (!sessionFile) return "";

  try {
    const raw = await readFile(sessionFile, "utf-8");
    const lines = raw.trim().split("\n").filter(Boolean);
    const cutoff = Date.now() - windowHours * 60 * 60 * 1000;

    const messages: HistoryMessage[] = [];
    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        if (entry.type !== "message") continue;
        const msg = entry.message;
        if (!msg || !["user", "assistant"].includes(msg.role)) continue;

        const ts = new Date(entry.timestamp).getTime();
        if (ts < cutoff) continue;

        const text = extractText(msg.content);
        if (!text.trim()) continue;

        // Skip tool calls and system metadata
        if (text.includes("Conversation info (untrusted metadata)")) continue;

        const time = new Date(entry.timestamp).toISOString().slice(11, 16); // HH:MM
        messages.push({ role: msg.role, text: text.trim(), timestamp: time });
      } catch {
        // skip malformed lines
      }
    }

    if (messages.length === 0) return "";

    // Format compactly, trim long messages
    const MAX_MSG_CHARS = 300;
    const lines2: string[] = ["## Recent conversation (last 2h)\n"];
    let total = lines2[0].length;

    for (const m of messages) {
      const label = m.role === "user" ? "user" : "bot";
      const text = m.text.length > MAX_MSG_CHARS
        ? m.text.slice(0, MAX_MSG_CHARS) + "…"
        : m.text;
      const line = `[${m.timestamp}] ${label}: ${text}`;
      if (total + line.length > maxChars) break;
      lines2.push(line);
      total += line.length;
    }

    if (lines2.length <= 1) return "";
    return lines2.join("\n");
  } catch {
    return "";
  }
}
