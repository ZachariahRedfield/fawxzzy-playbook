import { execSync } from 'node:child_process';

function hasPnpm() {
  try {
    execSync('pnpm -v', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

const command = hasPnpm() ? 'pnpm -r build' : 'npm run build';
execSync(command, { stdio: 'inherit' });
