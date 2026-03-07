#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const COMMANDS_START = '<!-- PLAYBOOK:COMMANDS_START -->';
const COMMANDS_END = '<!-- PLAYBOOK:COMMANDS_END -->';
const EXAMPLES_START = '<!-- PLAYBOOK:EXAMPLES_START -->';
const EXAMPLES_END = '<!-- PLAYBOOK:EXAMPLES_END -->';
const DOCS_COMMANDS_START = '<!-- PLAYBOOK:DOCS_COMMAND_STATUS_START -->';
const DOCS_COMMANDS_END = '<!-- PLAYBOOK:DOCS_COMMAND_STATUS_END -->';
const DOCS_UTILITIES_START = '<!-- PLAYBOOK:DOCS_UTILITY_COMMANDS_START -->';
const DOCS_UTILITIES_END = '<!-- PLAYBOOK:DOCS_UTILITY_COMMANDS_END -->';

const categories = ['Core', 'Repository tools', 'Repository intelligence', 'Utility'];
const args = new Set(process.argv.slice(2));
const checkMode = args.has('--check');

const getManagedRange = (content, startMarker, endMarker) => {
  const startIndex = content.indexOf(startMarker);
  const endIndex = content.indexOf(endMarker);

  if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
    throw new Error(`Missing or invalid managed markers: ${startMarker} ... ${endMarker}`);
  }

  return {
    start: startIndex + startMarker.length,
    end: endIndex
  };
};

const code = (value) => '`' + value + '`';

const replaceManagedBlock = (content, startMarker, endMarker, replacement) => {
  const range = getManagedRange(content, startMarker, endMarker);
  return `${content.slice(0, range.start)}\n${replacement}\n${content.slice(range.end)}`;
};

const loadCommandMetadata = async () => {
  const modulePath = path.join(repoRoot, 'packages/cli/dist/lib/commandMetadata.js');

  try {
    const metadataModule = await import(pathToFileURL(modulePath).href);
    return metadataModule.commandMetadata;
  } catch (error) {
    throw new Error(
      `Unable to load command metadata from ${modulePath}. Run "pnpm -r build" before running this script.\n${String(error)}`
    );
  }
};

const renderManagedCommands = (commands) => {
  const lines = [''];

  for (const category of categories) {
    const categoryCommands = commands.filter((command) => command.category === category);
    if (categoryCommands.length === 0) {
      continue;
    }

    lines.push(`### ${category}`);
    lines.push('');

    const productFacing = categoryCommands.filter((command) => command.productFacing);
    const utility = categoryCommands.filter((command) => !command.productFacing);

    if (productFacing.length > 0) {
      for (const command of productFacing) {
        lines.push(`- ${code(command.name)}: ${command.description}`);
        lines.push(`  - Example: ${code(command.example)}`);
      }
      lines.push('');
    }

    if (utility.length > 0) {
      for (const command of utility) {
        lines.push(`- ${code(command.name)}: ${command.description}`);
      }
      lines.push('');
    }
  }

  if (lines[lines.length - 1] === '') {
    lines.pop();
  }

  return lines.join('\n');
};

const renderManagedExamples = (commands) => {
  const lines = [''];
  const productFacing = commands.filter((command) => command.productFacing);

  lines.push('| Command | Example |');
  lines.push('| --- | --- |');
  for (const command of productFacing) {
    lines.push(`| ${code(command.name)} | ${code(command.example)} |`);
  }

  return lines.join('\n');
};

const renderDocsProductCommands = (commands) => {
  const lines = [''];
  lines.push('| Command / Artifact | Purpose | Status | Example |');
  lines.push('| --- | --- | --- | --- |');

  const productCommands = commands.filter((command) => command.productFacing);
  for (const command of productCommands) {
    lines.push(`| ${code(command.name)} | ${command.description} | Current (implemented) | ${code(command.example)} |`);
  }

  return lines.join('\n');
};

const renderDocsUtilityCommands = (commands) => {
  const utilityCommands = commands.filter((command) => !command.productFacing);
  const lines = [''];

  for (const command of utilityCommands) {
    lines.push(`- ${code(command.name)}`);
  }

  return lines.join('\n');
};

const updateFile = (current, updates) => {
  let next = current;
  for (const update of updates) {
    next = replaceManagedBlock(next, update.start, update.end, update.content);
  }
  return next;
};

const run = async () => {
  const commands = await loadCommandMetadata();

  const targets = [
    {
      relativePath: 'AGENTS.md',
      updates: [
        { start: COMMANDS_START, end: COMMANDS_END, content: renderManagedCommands(commands) },
        { start: EXAMPLES_START, end: EXAMPLES_END, content: renderManagedExamples(commands) }
      ]
    },
    {
      relativePath: 'docs/commands/README.md',
      updates: [
        { start: DOCS_COMMANDS_START, end: DOCS_COMMANDS_END, content: renderDocsProductCommands(commands) },
        { start: DOCS_UTILITIES_START, end: DOCS_UTILITIES_END, content: renderDocsUtilityCommands(commands) }
      ]
    }
  ];

  let changedFiles = 0;

  for (const target of targets) {
    const filePath = path.join(repoRoot, target.relativePath);
    const current = await fs.readFile(filePath, 'utf8');
    const next = updateFile(current, target.updates);

    if (current !== next) {
      changedFiles += 1;
      if (!checkMode) {
        await fs.writeFile(filePath, next);
      }
    }
  }

  if (checkMode) {
    if (changedFiles > 0) {
      console.error(`Managed docs are stale in ${changedFiles} file(s). Run "pnpm docs:update".`);
      process.exitCode = 1;
      return;
    }
    console.log('Managed docs are up to date.');
    return;
  }

  if (changedFiles === 0) {
    console.log('Managed docs already up to date.');
    return;
  }

  console.log(`Updated managed docs in ${changedFiles} file(s).`);
};

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
