import { spawnSync } from 'node:child_process';

const result = spawnSync('npm', ['pack', '--dry-run'], {
  cwd: 'packages/cli',
  encoding: 'utf8'
});

const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;

if (result.status !== 0) {
  throw new Error(output || `npm pack --dry-run failed with status ${result.status}`);
}

if (!output.includes('dist/main.js')) {
  throw new Error('npm pack --dry-run missing dist/main.js in packages/cli tarball output');
}

console.log('pack check passed: dist/main.js included');
