import { execFileSync } from 'node:child_process';

const git = (repoRoot: string, args: string[]): string =>
  execFileSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  }).trim();

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

export const isGitRepository = (repoRoot: string): boolean =>
  tryGit(repoRoot, ['rev-parse', '--is-inside-work-tree']) === 'true';

export const resolveDiffBase = (repoRoot: string): { baseRef?: string; baseSha?: string; warning?: string } => {
  if (!isGitRepository(repoRoot)) {
    return {
      warning: 'Repository is not a git work tree; skipping diff-based verification checks.'
    };
  }

  const head = 'HEAD';
  const headSha = tryGit(repoRoot, ['rev-parse', head]);

  const originMain = getMergeBase(repoRoot, 'origin/main', head);
  if (originMain) return { baseRef: 'origin/main', baseSha: originMain };

  const mergeBaseMain = getMergeBase(repoRoot, 'main', head);
  if (mergeBaseMain) {
    if (headSha && mergeBaseMain === headSha) {
      const previous = tryGit(repoRoot, ['rev-parse', 'HEAD~1']);
      if (previous) {
        return {
          baseRef: 'HEAD~1',
          baseSha: previous,
          warning: 'On main; using HEAD~1 for diff base.',
        };
      }
    }

    return { baseRef: 'main', baseSha: mergeBaseMain };
  }

  const previous = tryGit(repoRoot, ['rev-parse', 'HEAD~1']);
  if (previous) return { baseRef: 'HEAD~1', baseSha: previous };

  return { warning: 'Unable to determine diff base; treating as no changes.' };
};
