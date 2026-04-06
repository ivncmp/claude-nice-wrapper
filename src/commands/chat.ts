import { createInterface } from "node:readline";
import { Command } from "commander";
import chalk from "chalk";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { execClaude } from "../claude.js";
import { addHistoryEntry } from "../lib/history-store.js";
import { buildMemoryContext } from "../lib/memory-store.js";
import { buildLifeContext } from "../lib/life-store.js";
import { loadConfig, getDataDir, ensureDataDir } from "../lib/config.js";
import type { SessionInfo } from "../lib/types.js";

const SESSION_FILE = "current-session.json";

async function loadSession(): Promise<SessionInfo | null> {
  try {
    const raw = await readFile(join(getDataDir(), SESSION_FILE), "utf-8");
    return JSON.parse(raw) as SessionInfo;
  } catch {
    return null;
  }
}

async function saveSession(session: SessionInfo): Promise<void> {
  await ensureDataDir();
  await writeFile(
    join(getDataDir(), SESSION_FILE),
    JSON.stringify(session, null, 2) + "\n",
    "utf-8"
  );
}

export function createChatCommand(): Command {
  return new Command("chat")
    .description("Start an interactive conversation with Claude")
    .option("-c, --continue", "Continue last conversation")
    .option("-r, --resume <id>", "Resume a specific session")
    .option("-m, --model <model>", "Model to use")
    .option("--max-turns <n>", "Max agent turns per message", parseInt)
    .option("--no-memory", "Skip memory injection")
    .option("--no-life", "Skip life/PARA context injection")
    .action(async (opts) => {
      try {
        await runChat(opts);
      } catch (err) {
        console.error(chalk.red((err as Error).message));
        process.exit(1);
      }
    });
}

async function runChat(opts: Record<string, unknown>): Promise<void> {
  const config = await loadConfig();

  let sessionId: string | undefined;

  // Resume or continue
  if (opts.resume) {
    sessionId = opts.resume as string;
    console.log(chalk.dim(`Resuming session: ${sessionId}`));
  } else if (opts.continue) {
    const prev = await loadSession();
    if (prev) {
      sessionId = prev.sessionId;
      console.log(chalk.dim(`Continuing session: ${sessionId}`));
    } else {
      console.log(chalk.dim("No previous session found. Starting new chat."));
    }
  }

  // Build memory + life context for system prompt
  const contextParts: string[] = [];
  if (opts.memory !== false) {
    const memoryCtx = await buildMemoryContext(
      undefined,
      config.memory.maxInjectionChars
    );
    if (memoryCtx) {
      contextParts.push(memoryCtx);
    }
  }

  if (opts.life !== false && config.life.autoInject) {
    const lifeCtx = await buildLifeContext(undefined, config.life.maxInjectionChars);
    if (lifeCtx) {
      contextParts.push(lifeCtx);
    }
  }

  const appendSystemPrompt = contextParts.length > 0
    ? contextParts.join("\n\n---\n\n")
    : undefined;

  console.log(chalk.bold.blue("Claude Chat"));
  console.log(chalk.dim('Type "exit" or Ctrl+C to quit.\n'));

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: chalk.green("you > "),
  });

  rl.prompt();

  rl.on("line", async (line: string) => {
    const input = line.trim();
    if (!input) {
      rl.prompt();
      return;
    }

    if (input === "exit" || input === "quit") {
      console.log(chalk.dim("Bye!"));
      rl.close();
      return;
    }

    try {
      process.stdout.write(chalk.dim("thinking...\r"));

      const result = await execClaude({
        prompt: input,
        model: (opts.model as string) ?? config.defaults.model,
        maxTurns: (opts.maxTurns as number) ?? config.defaults.maxTurns,
        appendSystemPrompt: !sessionId ? appendSystemPrompt : undefined,
        resumeSessionId: sessionId,
      });

      // Clear "thinking..." and print response
      process.stdout.write("\r" + " ".repeat(20) + "\r");
      console.log(chalk.cyan("claude > ") + result.result);
      console.log();

      // Capture session ID from first response
      if (!sessionId && result.sessionId) {
        sessionId = result.sessionId;
        await saveSession({
          sessionId,
          startedAt: new Date().toISOString(),
        });
      }

      // Save to history
      await addHistoryEntry({
        prompt: input,
        result: result.result,
        sessionId: result.sessionId,
        costUsd: result.costUsd,
        durationMs: result.durationMs,
        model: opts.model as string,
      });
    } catch (err) {
      console.error(chalk.red((err as Error).message));
    }

    rl.prompt();
  });

  rl.on("close", () => {
    process.exit(0);
  });
}
