import { spawnSync } from 'node:child_process';
import { isNetworkRestricted } from './env.mjs';

const RESTRICTED_HINT = 'Set PLAYBOOK_NO_NETWORK=1 to explicitly run in offline/restricted mode.';
const CI_HINT = 'CI should use pnpm/action-setup@v4 with a committed pnpm-lock.yaml.';
const CORP_HINT = 'For restricted corp machines, configure an internal npm registry or approved mirror; do not auto-download tooling.';

const warnings = [];
const restricted = isNetworkRestricted();

const pushWarning = (message) => warnings.push(`WARN: ${message}`);

const run = (cmd, args) => spawnSync(cmd, args, { encoding: 'utf8' });

const pnpmResult = run('pnpm', ['--version']);

if (pnpmResult.error && pnpmResult.error.code === 'ENOENT') {
  if (restricted) {
    pushWarning(`pnpm not available and downloads disabled; set up pnpm manually or run in CI; skipping. ${RESTRICTED_HINT} ${CI_HINT} ${CORP_HINT}`);
  } else {
    pushWarning(`pnpm is not on PATH. Install pnpm@10.0.0 manually. ${RESTRICTED_HINT}`);
  }
} else if (pnpmResult.status !== 0) {
  const combined = `${pnpmResult.stdout ?? ''}\n${pnpmResult.stderr ?? ''}`;
  const corepackLike = /(corepack|prepare|registry\.npmjs\.org\/pnpm|Error when performing the request)/i.test(combined);

  if (corepackLike && restricted) {
    pushWarning(`pnpm appears to be a Corepack shim and cannot download in this restricted environment; skipping version check. ${RESTRICTED_HINT} ${CI_HINT} ${CORP_HINT}`);
  } else if (corepackLike) {
    pushWarning(`pnpm invocation appears to rely on Corepack download and failed. Install pnpm directly (npm/brew/internal mirror) or run in CI with pnpm/action-setup@v4. ${RESTRICTED_HINT}`);
  } else {
    pushWarning(`pnpm --version failed: ${combined.trim() || 'unknown error'}`);
  }
} else {
  console.log(`OK: pnpm version ${pnpmResult.stdout.trim()}`);
}

if (restricted) {
  pushWarning(`Cannot install pnpm globally (network restricted). Options: use GitHub Actions (pnpm/action-setup@v4 + pnpm-lock.yaml), install pnpm from an internal mirror/approved registry, or ensure pnpm is already on PATH. ${RESTRICTED_HINT}`);
} else {
  const npmInstall = run('npm', ['i', '-g', 'pnpm@10.0.0']);
  if (npmInstall.status !== 0) {
    const output = `${npmInstall.stdout ?? ''}\n${npmInstall.stderr ?? ''}`.trim();
    pushWarning(`npm global pnpm install failed (non-fatal): ${output || 'unknown error'}. ${RESTRICTED_HINT} ${CI_HINT} ${CORP_HINT}`);
  } else {
    console.log('OK: npm global pnpm install check passed');
  }
}

if (warnings.length) {
  for (const warning of warnings) console.warn(warning);
}

process.exit(0);
