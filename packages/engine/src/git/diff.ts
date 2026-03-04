import { execFileSync } from 'node:child_process';
import { toPosixPath } from '../util/paths.js';

export const getChangedFiles = (repoRoot: string, baseSha: string, headRef = 'HEAD'): string[] => {
  const output = execFileSync('git', ['diff', '--name-only', `${baseSha}..${headRef}`], {
    cwd: repoRoot,
    encoding: 'utf8'
  });

  return output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map(toPosixPath);
};
