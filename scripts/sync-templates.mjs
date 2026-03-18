import fs from 'node:fs';
import path from 'node:path';
import { withTempDir, promoteStagedDirectory } from './staged-artifact-workflow.mjs';

const repoRoot = process.cwd();
const srcRoot = path.resolve(repoRoot, 'templates/repo');
const destRoot = path.resolve(repoRoot, 'packages/cli/templates/repo');

const main = async () => {
  if (!fs.existsSync(srcRoot) || !fs.statSync(srcRoot).isDirectory()) {
    throw new Error(`Template source directory not found: ${srcRoot}`);
  }

  await withTempDir('playbook-sync-templates-', async (stagingRoot) => {
    const stagedDestRoot = path.join(stagingRoot, 'packages', 'cli', 'templates', 'repo');
    fs.mkdirSync(path.dirname(stagedDestRoot), { recursive: true });
    fs.cpSync(srcRoot, stagedDestRoot, { recursive: true });
    await promoteStagedDirectory({ stagedPath: stagedDestRoot, destinationPath: destRoot });
    console.log('Synced templates/repo -> packages/cli/templates/repo via generate → promote.');
  });
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
