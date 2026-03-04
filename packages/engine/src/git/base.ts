import { execFileSync } from 'node:child_process';

const git = (repoRoot: string, args: string[]): string =>
  execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' }).trim();

const tryGit = (repoRoot: string, args: string[]): string | undefined => {
  try {
    const out = git(repoRoot, args);
    return out || undefined;
  } catch {
    return undefined;
  }
};

export const getMergeBase = (repoRoot: string, baseRef: string, headRef = 'HEAD'): string | undefined =>
  tryGit(repoRoot, ['merge-base', baseRef, headRef]);

export const resolveDiffBase = (repoRoot: string): { baseRef?: string; baseSha?: string; warning?: string } => {
  const head = 'HEAD';

  const originMain = getMergeBase(repoRoot, 'origin/main', head);
  if (originMain) return { baseRef: 'origin/main', baseSha: originMain };

  const main = getMergeBase(repoRoot, 'main', head);
  if (main) return { baseRef: 'main', baseSha: main };

  const previous = tryGit(repoRoot, ['rev-parse', 'HEAD~1']);
  if (previous) return { baseRef: 'HEAD~1', baseSha: previous };

  return { warning: 'Unable to determine diff base; treating as no changes.' };
};
