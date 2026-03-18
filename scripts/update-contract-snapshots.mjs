import path from 'node:path';
import { generateContractSnapshots, repoRoot } from './contract-snapshot-lib.mjs';
import { withTempDir, promoteStagedFiles } from './staged-artifact-workflow.mjs';

const main = async () => {
  await withTempDir('playbook-contract-snapshots-', async (stagingRoot) => {
    const stagedSnapshotDir = path.join(stagingRoot, 'tests', 'contracts');
    const generatedFiles = generateContractSnapshots(stagedSnapshotDir);

    if (process.env.PLAYBOOK_FAIL_BEFORE_SNAPSHOT_PROMOTION === '1') {
      throw new Error('snapshot promotion intentionally aborted before promotion');
    }

    await promoteStagedFiles({
      stageRoot: stagingRoot,
      relativePaths: generatedFiles.map((file) => path.join('tests', 'contracts', file)),
      destinationRoot: repoRoot
    });

    console.log(`Refreshed ${generatedFiles.length} contract snapshot(s) via generate → validate → promote.`);
  });
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
