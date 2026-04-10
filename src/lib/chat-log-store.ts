import { appendFile, mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";

const CHATS_DIR = join(homedir(), "life", "chats");

function getTodayFile(): string {
  const today = new Date().toISOString().slice(0, 10);
  return join(CHATS_DIR, `${today}.md`);
}

/**
 * Strips openclaw metadata blocks (Conversation info / Sender untrusted metadata)
 * from the beginning of the prompt, returning only the actual user message.
 *
 * Openclaw prepends blocks like:
 *   Conversation info (untrusted metadata):
 *   ```json
 *   { ... }
 *   ```
 *   Sender (untrusted metadata):
 *   ```json
 *   { ... }
 *   ```
 *   <actual message>
 */
function extractUserMessage(prompt: string): string {
  const lastBacktick = prompt.lastIndexOf("```");
  if (lastBacktick !== -1) {
    const after = prompt.slice(lastBacktick + 3).trim();
    if (after) return after;
  }
  return prompt.trim();
}

export async function buildDayChatContext(): Promise<string> {
  try {
    const content = await readFile(getTodayFile(), "utf-8");
    const trimmed = content.trim();
    if (!trimmed) return "";
    return `## Conversación de hoy\n\n${trimmed}`;
  } catch {
    return "";
  }
}

export async function addChatLog(
  userPrompt: string,
  assistantResponse: string
): Promise<void> {
  const userMsg = extractUserMessage(userPrompt);
  const assistantMsg = assistantResponse.trim();

  if (!userMsg || !assistantMsg) return;

  await mkdir(CHATS_DIR, { recursive: true });
  const entry = `Yo: ${userMsg}\nAssistant: ${assistantMsg}\n\n`;
  await appendFile(getTodayFile(), entry, "utf-8");
}
