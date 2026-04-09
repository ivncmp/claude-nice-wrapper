import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";

interface HistoryMessage {
  role: "user" | "assistant";
  text: string;
  timestamp: string;
  ts: number;
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
// "Conversation info (untrusted metadata):\n```json\n...\n```\n\nSender...\n```\n\n<actual message>"
function stripTelegramMetadata(text: string): string {
  // Greedy match: find the LAST closing ``` followed by newlines, take everything after
  const match = text.match(/^[\s\S]*```\n+([\s\S]*)$/);
  if (match) return match[1].trim();
  return text.trim();
}

async function parseSessionFile(filePath: string, cutoff: number): Promise<HistoryMessage[]> {
  const messages: HistoryMessage[] = [];
  try {
    const raw = await readFile(filePath, "utf-8");
    for (const line of raw.trim().split("\n").filter(Boolean)) {
      try {
        const entry = JSON.parse(line);

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

        if (role === "user" && text.includes("(untrusted metadata)")) {
          text = stripTelegramMetadata(text);
        }

        if (!text.trim()) continue;

        const time = new Date(entry.timestamp).toISOString().slice(11, 16);
        messages.push({ role: role as "user" | "assistant", text: text.trim(), timestamp: time, ts });
      } catch {
        // skip malformed lines
      }
    }
  } catch {
    // skip unreadable files
  }
  return messages;
}

export async function buildRecentHistoryContext(
  sessionsDir: string,
  windowHours: number = 2,
  maxChars: number = 3000
): Promise<string> {
  const cutoff = Date.now() - windowHours * 60 * 60 * 1000;

  try {
    const files = await readdir(sessionsDir);
    const jsonlFiles = files.filter(
      f => f.endsWith(".jsonl") && !f.includes(".deleted") && !f.includes(".reset")
    );

    // Only consider files modified within the window (+ 1h buffer)
    const recentFiles = (
      await Promise.all(
        jsonlFiles.map(async f => {
          const s = await stat(join(sessionsDir, f));
          return { path: join(sessionsDir, f), mtime: s.mtimeMs };
        })
      )
    ).filter(f => f.mtime >= cutoff - 60 * 60 * 1000);

    if (recentFiles.length === 0) return "";

    // Parse all recent files and merge messages
    const allMessages: HistoryMessage[] = (
      await Promise.all(recentFiles.map(f => parseSessionFile(f.path, cutoff)))
    ).flat();

    if (allMessages.length === 0) return "";

    // Sort newest first, fill from most recent until we hit the char limit, then reverse for display
    allMessages.sort((a, b) => b.ts - a.ts);

    const MAX_MSG_CHARS = 300;
    const selected: string[] = [];
    let total = 0;

    for (const m of allMessages) {
      const label = m.role === "user" ? "user" : "bot";
      const text = m.text.length > MAX_MSG_CHARS
        ? m.text.slice(0, MAX_MSG_CHARS) + "…"
        : m.text;
      const line = `[${m.timestamp}] ${label}: ${text}`;
      if (total + line.length > maxChars) break;
      selected.push(line);
      total += line.length;
    }

    if (selected.length === 0) return "";
    selected.reverse(); // restore chronological order for display
    return ["## Recent conversation (last 2h)\n", ...selected].join("\n");
  } catch {
    return "";
  }
}
