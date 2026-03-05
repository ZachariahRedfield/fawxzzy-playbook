import { execFileSync } from 'node:child_process';

const IS_WINDOWS = process.platform === 'win32';
const COMSPEC = process.env.ComSpec || 'cmd.exe';
export const PNPM_BIN = 'pnpm';

export const shouldUseCmd = (command) => {
  if (!IS_WINDOWS) return false;
  const normalized = command.toLowerCase();
  return (
    normalized.endsWith('.cmd') ||
    normalized.endsWith('.bat') ||
    normalized === 'pnpm' ||
    normalized === 'corepack'
  );
};

const withMergedEnv = (options = {}) => ({
  ...options,
  env: { ...process.env, ...(options.env ?? {}) }
});

const quoteIfNeeded = (arg) => {
  if (!arg.includes(' ')) return arg;
  return `"${arg.replaceAll('"', '\\"')}"`;
};

const buildCommandString = (command, args = []) => `${quoteIfNeeded(command)} ${args.map(quoteIfNeeded).join(' ')}`;

const logFailureContext = (command, options = {}) => {
  if (command !== PNPM_BIN) return;
  const cwd = options.cwd ?? process.cwd();
  const pathLength = (process.env.PATH ?? '').length;
  console.error(`[spawn-debug] pathLength=${pathLength} pnpmBin=${PNPM_BIN} cwd=${cwd}`);
};

const runExecFileSync = (command, args, options = {}) => {
  if (shouldUseCmd(command)) {
    const payload = buildCommandString(command, args);
    return execFileSync(COMSPEC, ['/d', '/s', '/c', payload], options);
  }

  return execFileSync(command, args, options);
};

export const run = (command, args, options = {}) => {
  const mergedOptions = withMergedEnv(options);
  try {
    return runExecFileSync(command, args, {
      stdio: 'pipe',
      encoding: 'utf8',
      ...mergedOptions
    });
  } catch (error) {
    logFailureContext(command, mergedOptions);
    throw error;
  }
};

export const runLogged = (command, args, options = {}) => {
  const mergedOptions = withMergedEnv(options);
  try {
    return runExecFileSync(command, args, {
      stdio: 'inherit',
      ...mergedOptions
    });
  } catch (error) {
    logFailureContext(command, mergedOptions);
    throw error;
  }
};
