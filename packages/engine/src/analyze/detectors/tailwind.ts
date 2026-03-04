import fs from 'node:fs';
import path from 'node:path';

export const detectTailwind = (repoRoot: string, pkg: Record<string, string>): boolean => {
  const files = ['tailwind.config.js', 'tailwind.config.cjs', 'tailwind.config.ts'];
  return files.some((f) => fs.existsSync(path.join(repoRoot, f))) || Boolean(pkg.tailwindcss);
};
