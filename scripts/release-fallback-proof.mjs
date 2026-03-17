#!/usr/bin/env node
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const DEFAULT_OWNER = 'ZachariahRedfield';
const DEFAULT_REPO = 'playbook';

const parseArgs = () => {
  const args = process.argv.slice(2);
  const result = {
    owner: DEFAULT_OWNER,
    repo: DEFAULT_REPO,
    version: '',
    consumerRepo: '',
    json: false
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--version') result.version = args[++i] ?? '';
    else if (arg === '--owner') result.owner = args[++i] ?? DEFAULT_OWNER;
    else if (arg === '--repo') result.repo = args[++i] ?? DEFAULT_REPO;
    else if (arg === '--consumer-repo') result.consumerRepo = args[++i] ?? '';
    else if (arg === '--json') result.json = true;
    else if (arg === '--help') {
      process.stdout.write(
        [
          'Usage: node scripts/release-fallback-proof.mjs --version <x.y.z> [--consumer-repo <path>] [--json]',
          '',
          'Verifies Playbook release fallback tarball provisioning and (optionally) runs consumer fallback smoke checks.',
          'Constructed URL: https://github.com/<owner>/<repo>/releases/download/v<version>/playbook-cli-<version>.tgz'
        ].join('\n') + '\n'
      );
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!result.version) throw new Error('--version is required');
  return result;
};

const run = (cmd, args, cwd = process.cwd()) => {
  const child = spawnSync(cmd, args, { cwd, encoding: 'utf8' });
  return {
    ok: child.status === 0,
    status: child.status,
    stdout: child.stdout,
    stderr: child.stderr,
    command: `${cmd} ${args.join(' ')}`
  };
};

const main = async () => {
  const options = parseArgs();
  const assetUrl = `https://github.com/${options.owner}/${options.repo}/releases/download/v${options.version}/playbook-cli-${options.version}.tgz`;

  const tmp = mkdtempSync(path.join(os.tmpdir(), 'playbook-release-fallback-proof-'));
  const tarPath = path.join(tmp, `playbook-cli-${options.version}.tgz`);

  const download = run('curl', ['-sSfL', assetUrl, '-o', tarPath]);
  const inspect = download.ok ? run('tar', ['-tzf', tarPath]) : { ok: false, command: 'tar -tzf <downloaded-tarball>' };

  const checks = [
    { name: 'release asset download', ...download },
    { name: 'release asset tar inspection', ...inspect }
  ];

  if (options.consumerRepo) {
    const specValue = `@${assetUrl}`;
    const envPath = path.join(options.consumerRepo, '.env.playbook-fallback-proof');
    writeFileSync(envPath, `PLAYBOOK_OFFICIAL_FALLBACK_SPEC=${specValue}\n`, 'utf8');

    checks.push(
      { name: 'consumer npm install', ...run('npm', ['install'], options.consumerRepo) },
      {
        name: 'consumer package acquisition attempt',
        ...run('npm', ['install', '@fawxzzy/playbook-cli@9999.0.0'], options.consumerRepo)
      },
      {
        name: 'consumer fallback acquisition from release tarball',
        ...run('npm', ['install', '--no-save', specValue], options.consumerRepo)
      },
      { name: 'consumer canonical ladder: verify', ...run('npx', ['playbook', 'verify', '--json'], options.consumerRepo) },
      { name: 'consumer canonical ladder: plan', ...run('npx', ['playbook', 'plan', '--json'], options.consumerRepo) },
      { name: 'consumer canonical ladder: apply', ...run('npx', ['playbook', 'apply', '--json'], options.consumerRepo) }
    );

    const requiredArtifacts = [
      '.playbook/findings.json',
      '.playbook/plan.json',
      '.playbook/repo-graph.json',
      '.playbook/last-run.json'
    ];

    for (const artifact of requiredArtifacts) {
      const artifactPath = path.join(options.consumerRepo, artifact);
      checks.push({
        name: `artifact assertion: ${artifact}`,
        ok: existsSync(artifactPath),
        command: `test -f ${artifact}`,
        status: existsSync(artifactPath) ? 0 : 1
      });
    }
  }

  const ok = checks.every((item) => item.ok);
  if (options.json) {
    process.stdout.write(
      JSON.stringify(
        {
          ok,
          version: options.version,
          assetUrl,
          checks: checks.map((item) => ({
            name: item.name,
            ok: item.ok,
            command: item.command,
            status: item.status ?? null,
            stdout: item.stdout?.trim() || undefined,
            stderr: item.stderr?.trim() || undefined
          }))
        },
        null,
        2
      ) + '\n'
    );
  } else {
    for (const item of checks) {
      process.stdout.write(`${item.ok ? 'PASS' : 'FAIL'} ${item.name}: ${item.command}\n`);
    }
    process.stdout.write(`Asset URL: ${assetUrl}\n`);
  }

  rmSync(tmp, { recursive: true, force: true });
  if (!ok) process.exit(1);
};

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
