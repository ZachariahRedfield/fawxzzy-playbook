import fs from 'node:fs';
import path from 'node:path';

const srcRoot = path.resolve('templates/repo');
const destRoot = path.resolve('packages/cli/templates/repo');

const copyDir = (src, dest) => {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(srcPath, destPath);
    else fs.copyFileSync(srcPath, destPath);
  }
};

fs.rmSync(destRoot, { recursive: true, force: true });
copyDir(srcRoot, destRoot);
console.log('Synced templates/repo -> packages/cli/templates/repo');
