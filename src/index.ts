import { Command } from "commander";
import chalk from "chalk";
import { createAskCommand, runAsk } from "./commands/ask.js";
import { createChatCommand } from "./commands/chat.js";
import { createHistoryCommand } from "./commands/history.js";
import { createMemoryCommand } from "./commands/memory.js";
import { createTemplateCommand } from "./commands/template.js";
import { loadConfig, setConfigValue, getConfigValue } from "./lib/config.js";

const program = new Command();

program
  .name("cw")
  .description("CLI wrapper for claude -p with history, memory, chat, and templates")
  .version("0.1.0");

// Subcommands
program.addCommand(createAskCommand());
program.addCommand(createChatCommand());
program.addCommand(createHistoryCommand());
program.addCommand(createMemoryCommand());
program.addCommand(createTemplateCommand());

// Config command
const configCmd = new Command("config").description("Manage configuration");

configCmd
  .command("set <key> <value>")
  .description("Set a config value (e.g., memory.autoInject true)")
  .action(async (key: string, value: string) => {
    await setConfigValue(key, value);
    console.log(chalk.green(`${key} = ${value}`));
  });

configCmd
  .command("get <key>")
  .description("Get a config value")
  .action(async (key: string) => {
    const value = await getConfigValue(key);
    if (value === undefined) {
      console.error(chalk.red(`Config key "${key}" not found.`));
      process.exit(1);
    }
    console.log(JSON.stringify(value, null, 2));
  });

configCmd.action(async () => {
  const config = await loadConfig();
  console.log(JSON.stringify(config, null, 2));
});

program.addCommand(configCmd);

// Default behavior: if args look like a prompt (not a known command), run ask
program
  .argument("[prompt...]", "Send a quick prompt (shorthand for 'cw ask')")
  .option("-m, --model <model>", "Model to use")
  .option("--max-turns <n>", "Max agent turns", parseInt)
  .option("--max-budget-usd <n>", "Max budget in USD", parseFloat)
  .option("-o, --output-format <format>", "Output format")
  .option("--no-memory", "Skip memory injection")
  .option("--memory <keys>", "Inject specific memory keys")
  .option("--no-life", "Skip life/PARA context injection")
  .option("--no-history", "Don't save to history")
  .option("--raw", "Print raw JSON response")
  .option("--token-footer", "Append token usage footer to response text")
  .option("--max-session-tokens <n>", "Reset session if context exceeds this token count", parseInt)
  .option("--history-dir <path>", "Openclaw sessions dir to inject recent history on reset")
  .option("-c, --continue", "Continue last conversation")
  .option("-r, --resume <id>", "Resume a specific session")
  .action(async (promptParts: string[], opts) => {
    if (promptParts.length === 0) {
      program.help();
      return;
    }
    try {
      await runAsk(promptParts, opts);
    } catch (err) {
      console.error(chalk.red((err as Error).message));
      process.exit(1);
    }
  });

program.parse();
