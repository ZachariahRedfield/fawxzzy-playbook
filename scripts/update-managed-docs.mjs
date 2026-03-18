#!/usr/bin/env node
import process from 'node:process';
import {
  countChangedManagedDocsArtifacts,
  generateManagedDocsArtifacts,
  writeManagedDocsArtifacts
} from './managed-docs-lib.mjs';

const checkMode = new Set(process.argv.slice(2)).has('--check');

const run = async () => {
  const outputs = await generateManagedDocsArtifacts();
  const changedFiles = countChangedManagedDocsArtifacts(outputs);

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

  await writeManagedDocsArtifacts(outputs);
  console.log(`Updated managed docs in ${changedFiles} file(s).`);
};

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
