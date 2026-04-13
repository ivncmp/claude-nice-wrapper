import { readFile, writeFile, readdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';

import { parse, stringify } from 'yaml';

import { getDataDir, ensureDataDir } from './config.js';
import type { TemplateDefinition } from './types.js';

function getTemplateDir(): string {
  return join(getDataDir(), 'templates');
}

function nameToFile(name: string): string {
  return join(getTemplateDir(), `${name}.yaml`);
}

export async function getTemplate(name: string): Promise<TemplateDefinition | null> {
  try {
    const raw = await readFile(nameToFile(name), 'utf-8');
    return parse(raw) as TemplateDefinition;
  } catch {
    return null;
  }
}

export async function saveTemplate(template: TemplateDefinition): Promise<void> {
  await ensureDataDir();
  await writeFile(nameToFile(template.name), stringify(template), 'utf-8');
}

export async function listTemplates(): Promise<TemplateDefinition[]> {
  try {
    const files = await readdir(getTemplateDir());
    const templates: TemplateDefinition[] = [];
    for (const f of files) {
      if (!f.endsWith('.yaml')) continue;
      const raw = await readFile(join(getTemplateDir(), f), 'utf-8');
      templates.push(parse(raw) as TemplateDefinition);
    }
    return templates;
  } catch {
    return [];
  }
}

export async function deleteTemplate(name: string): Promise<boolean> {
  try {
    await unlink(nameToFile(name));
    return true;
  } catch {
    return false;
  }
}

export function renderTemplate(template: TemplateDefinition, vars: Record<string, string>): string {
  let prompt = template.prompt;
  for (const [key, value] of Object.entries(vars)) {
    prompt = prompt.replaceAll(`{{${key}}}`, value);
  }
  // Warn about unresolved variables and remove them
  const unresolved = prompt.match(/\{\{([^}]+)\}\}/g);
  if (unresolved) {
    const names = unresolved.map((v) => v.slice(2, -2));
    console.error(`Warning: unresolved template variable(s): ${names.join(', ')}`);
    prompt = prompt.replace(/\{\{[^}]+\}\}/g, '');
  }
  return prompt;
}
