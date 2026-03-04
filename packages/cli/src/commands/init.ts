import fs from 'node:fs';
import path from 'node:path';
import { ensureDir, listFilesRecursive } from '../lib/fs.js';
import { info } from '../lib/output.js';

const templateRoot = path.resolve(import.meta.dirname, '../../templates/repo');

export const runInit = (cwd: string): void => {
  const files = listFilesRecursive(templateRoot);
  for (const srcFile of files) {
    const rel = path.relative(templateRoot, srcFile);
    const dest = path.join(cwd, rel);
    ensureDir(path.dirname(dest));

    if (fs.existsSync(dest)) {
      info(`skipped ${rel}`);
      continue;
    }

    fs.copyFileSync(srcFile, dest);
    info(`created ${rel}`);
  }
};
