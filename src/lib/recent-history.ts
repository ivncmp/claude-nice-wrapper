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

// Strip Telegram metadata blocks from user messages:
// "Conversation info (untrusted metadata):\n```json\n...\n```\n\n..."
function stripTelegramMetadata(text: string): string {
  // Find the last closing ``` followed by a blank line, and take everything after
  const match = text.match(/^[\s\S]*?```\n\n([\s\S]*)$/);
  if (match) return match[1].trim();
  return text.trim();
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

        // Support both claude CLI format (type:"user"/"assistant") and legacy format (type:"message")
        let role: string | undefined;
        let msgContent: unknown;

        if (entry.type === "message" && entry.message) {
          role = entry.message.role;
          msgContent = entry.message.content;
        } else if ((entry.type === "user" || entry.type === "assistant") && entry.message) {
          role = entry.message.role ?? entry.type;
          msgContent = entry.message.content;
        } else {
          continue;
        }

        if (!role || !["user", "assistant"].includes(role)) continue;

        const ts = new Date(entry.timestamp).getTime();
        if (ts < cutoff) continue;

        let text = extractText(msgContent);
        if (!text.trim()) continue;

        // Strip Telegram metadata wrapper from user messages
        if (role === "user" && text.includes("(untrusted metadata)")) {
          text = stripTelegramMetadata(text);
        }

        if (!text.trim()) continue;

        const time = new Date(entry.timestamp).toISOString().slice(11, 16); // HH:MM
        messages.push({ role: role as "user" | "assistant", text: text.trim(), timestamp: time });
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
