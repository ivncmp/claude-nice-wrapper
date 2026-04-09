import { Command } from "commander";
import chalk from "chalk";
import { execClaude, readStdin } from "../claude.js";
import { addHistoryEntry } from "../lib/history-store.js";
import { buildMemoryContext } from "../lib/memory-store.js";
import { buildLifeContext } from "../lib/life-store.js";
import { loadConfig } from "../lib/config.js";
import { getSessionTokens, updateSessionTokens, getSessionIdleMinutes } from "../lib/session-state.js";
import { buildRecentHistoryContext } from "../lib/recent-history.js";
import type { ClaudeOptions } from "../lib/types.js";

export function createAskCommand(): Command {
  return new Command("ask")
    .description("Send a prompt to Claude")
    .argument("[prompt...]", "The prompt to send")
    .option("-m, --model <model>", "Model to use")
    .option("--max-turns <n>", "Max agent turns", parseInt)
    .option("--max-budget-usd <n>", "Max budget in USD", parseFloat)
    .option("-o, --output-format <format>", "Output format: text, json, stream-json")
    .option("--system-prompt <text>", "System prompt override")
    .option("--no-memory", "Skip memory injection")
    .option("--memory <keys>", "Inject only specific memory keys (comma-separated)")
    .option("--no-life", "Skip life/PARA context injection")
    .option("--no-history", "Don't save to history")
    .option("--raw", "Print raw JSON response")
    .option("--token-footer", "Append token usage footer to response text")
    .option("--max-session-tokens <n>", "Reset session if context exceeds this token count", parseInt)
    .option("--history-dir <path>", "Openclaw sessions dir to inject recent history on reset")
    .option("-c, --continue", "Continue last conversation")
    .option("-r, --resume <id>", "Resume a specific session")
    .action(async (promptParts: string[], opts) => {
      try {
        await runAsk(promptParts, opts);
      } catch (err) {
        console.error(chalk.red((err as Error).message));
        process.exit(1);
      }
    });
}

export async function runAsk(
  promptParts: string[],
  opts: Record<string, unknown>
): Promise<void> {
  const config = await loadConfig();
  const stdinContent = await readStdin();
  const promptText = promptParts.join(" ");

  if (!promptText && !stdinContent) {
    console.error(chalk.red("No prompt provided. Usage: cw ask \"your question\""));
    process.exit(1);
  }

  // Build the full prompt
  let fullPrompt = promptText;
  if (stdinContent) {
    fullPrompt = fullPrompt
      ? `${fullPrompt}\n\n---\n\n${stdinContent}`
      : stdinContent;
  }

  // Build memory + life context
  const contextParts: string[] = [];

  if (opts.memory !== false) {
    const memoryKeys =
      typeof opts.memory === "string"
        ? (opts.memory as string).split(",")
        : config.memory.defaultKeys.length
          ? config.memory.defaultKeys
          : undefined;

    const memoryCtx = await buildMemoryContext(
      memoryKeys,
      config.memory.maxInjectionChars
    );
    if (memoryCtx) {
      contextParts.push(memoryCtx);
    }
  }

  if (opts.life !== false && config.life.autoInject) {
    const lifeCtx = await buildLifeContext(fullPrompt, config.life.maxInjectionChars);
    if (lifeCtx) {
      contextParts.push(lifeCtx);
    }
  }

  // Check session token limit before resuming
  let resumeSessionId = opts.resume as string | undefined;
  const maxSessionTokens = opts.maxSessionTokens as number | undefined;
  if (resumeSessionId && maxSessionTokens) {
    const currentTokens = await getSessionTokens(resumeSessionId);
    if (currentTokens > maxSessionTokens) {
      resumeSessionId = undefined; // drop resume, start fresh
    }
  }

  // Inject recent chat history on new sessions or idle sessions (>30 min inactive)
  const sessionIdleMinutes = resumeSessionId
    ? await getSessionIdleMinutes(resumeSessionId)
    : Infinity;
  const shouldInjectHistory = opts.historyDir && (!resumeSessionId || sessionIdleMinutes > 30);

  if (shouldInjectHistory) {
    const recentHistory = await buildRecentHistoryContext(opts.historyDir as string);
    if (recentHistory) {
      contextParts.unshift(recentHistory);
    }
  }

  const appendSystemPrompt = contextParts.length > 0
    ? contextParts.join("\n\n---\n\n")
    : undefined;

  const claudeOpts: ClaudeOptions = {
    prompt: fullPrompt,
    model: (opts.model as string) ?? config.defaults.model,
    maxTurns: (opts.maxTurns as number) ?? config.defaults.maxTurns,
    maxBudgetUsd: opts.maxBudgetUsd as number | undefined,
    systemPrompt: opts.systemPrompt as string | undefined,
    appendSystemPrompt: resumeSessionId ? undefined : appendSystemPrompt,
    resumeSessionId,
    continueSession: opts.continue as boolean | undefined,
  };

  const result = await execClaude(claudeOpts);

  // Persist token count for this session
  if (result.sessionId && result.usage) {
    await updateSessionTokens(result.sessionId, result.usage.total);
  }

  // Append token footer if requested
  if (opts.tokenFooter && result.usage) {
    const u = result.usage;
    const parts: string[] = [];
    if (u.cacheWrite > 0) parts.push(`cW:${u.cacheWrite.toLocaleString()}`);
    if (u.cacheRead > 0) parts.push(`cR:${u.cacheRead.toLocaleString()}`);
    parts.push(`in:${u.input.toLocaleString()}`);
    parts.push(`out:${u.output.toLocaleString()}`);
    parts.push(`~${u.total.toLocaleString()}`);
    const footer = `\n\n—————————————\n\`${parts.join(" · ")}\``;
    result.result += footer;
    if (result.raw && typeof result.raw === "object") {
      (result.raw as Record<string, unknown>).result = result.result;
    }
  }

  // Output
  if (opts.raw) {
    console.log(JSON.stringify(result.raw ?? result, null, 2));
  } else if (opts.outputFormat === "json") {
    console.log(JSON.stringify({ result: result.result, sessionId: result.sessionId, costUsd: result.costUsd }, null, 2));
  } else {
    console.log(result.result);
  }

  // Save to history
  if (opts.history !== false) {
    await addHistoryEntry({
      prompt: fullPrompt,
      result: result.result,
      sessionId: result.sessionId,
      costUsd: result.costUsd,
      durationMs: result.durationMs,
      model: (opts.model as string) ?? config.defaults.model,
    });
  }
}
