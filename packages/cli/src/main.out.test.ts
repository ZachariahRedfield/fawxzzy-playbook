import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('cli --repo with --out json artifacts', () => {
  it('writes parseable artifacts for external repo targeting and supports later query reads', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'playbook-external-out-'));
    const targetRepo = path.join(tempRoot, 'consumer-repo');
    fs.mkdirSync(path.join(targetRepo, 'src'), { recursive: true });
    fs.writeFileSync(
      path.join(targetRepo, 'package.json'),
      JSON.stringify({ name: 'consumer-repo', version: '0.0.1', scripts: { test: 'echo ok' } }, null, 2),
      'utf8'
    );
    fs.writeFileSync(path.join(targetRepo, 'src', 'index.ts'), 'export const ok = true;\n', 'utf8');

    const scriptPath = path.resolve(process.cwd(), '..', '..', 'scripts', 'run-playbook.mjs');
    const findingsPath = path.join(targetRepo, '.playbook', 'findings.json');
    const planPath = path.join(targetRepo, '.playbook', 'plan.json');

    execFileSync('node', [scriptPath, '--repo', targetRepo, 'verify', '--json', '--out', findingsPath], {
      cwd: process.cwd(),
      encoding: 'utf8'
    });
    execFileSync('node', [scriptPath, '--repo', targetRepo, 'plan', '--json', '--out', planPath], {
      cwd: process.cwd(),
      encoding: 'utf8'
    });

    expect(() => JSON.parse(fs.readFileSync(findingsPath, 'utf8'))).not.toThrow();
    expect(() => JSON.parse(fs.readFileSync(planPath, 'utf8'))).not.toThrow();


    execFileSync('node', [scriptPath, '--repo', targetRepo, 'index', '--json'], {
      cwd: process.cwd(),
      encoding: 'utf8'
    });

    const queryRaw = execFileSync('node', [scriptPath, '--repo', targetRepo, 'query', 'modules', '--json'], {
      cwd: process.cwd(),
      encoding: 'utf8'
    });
    const queryJson = JSON.parse(queryRaw.slice(queryRaw.indexOf('{')));
    expect(queryJson.command).toBe('query');
    expect(Array.isArray(queryJson.result)).toBe(true);
  });
});
