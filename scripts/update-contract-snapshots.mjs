import { spawnSync } from 'node:child_process';

const result = spawnSync(
  'pnpm',
  ['exec', 'vitest', 'run', '--passWithNoTests', 'test/cliContracts.test.ts'],
  {
    stdio: 'inherit',
    shell: true,
    cwd: 'packages/cli',
    env: {
      ...process.env,
      UPDATE_CONTRACT_SNAPSHOTS: '1'
    }
  }
);

if (typeof result.status === 'number') {
  process.exit(result.status);
}

process.exit(1);
