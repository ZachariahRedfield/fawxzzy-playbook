import fs from 'node:fs';
import path from 'node:path';

export const detectNextjs = (repoRoot: string, pkg: Record<string, string>): boolean => {
  const nextConfigs = ['next.config.js', 'next.config.mjs', 'next.config.ts'];
  if (nextConfigs.some((f) => fs.existsSync(path.join(repoRoot, f)))) return true;
  if (fs.existsSync(path.join(repoRoot, 'app')) || fs.existsSync(path.join(repoRoot, 'pages'))) return true;
  return Boolean(pkg.next);
};
