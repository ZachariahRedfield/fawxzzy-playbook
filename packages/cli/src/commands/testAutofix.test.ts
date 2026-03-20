import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as applyCommand from './apply.js';
import { ExitCode } from '../lib/cliContract.js';
import { listRegisteredCommands } from './index.js';
import { runTestAutofix } from './testAutofix.js';
import { runSpawnSync } from '../lib/processRunner.js';

vi.mock('../lib/processRunner.js', () => ({
  runSpawnSync: vi.fn(),
}));

const mockedRunSpawnSync = vi.mocked(runSpawnSync);

const createRepo = (): string => fs.mkdtempSync(path.join(os.tmpdir(), 'playbook-test-autofix-'));

const writeFailureLog = (repo: string, lines: string[]): void => {
  fs.writeFileSync(path.join(repo, 'failure.log'), lines.join('\n'));
};

beforeEach(() => {
  mockedRunSpawnSync.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('runTestAutofix', () => {
  it('orchestrates triage -> fix-plan -> apply -> verification -> fixed and records remediation history', async () => {
    const repo = createRepo();
    writeFailureLog(repo, [
      '@fawxzzy/playbook test: FAIL  packages/cli/src/commands/schema.test.ts',
      '  × renders schema snapshot',
      '    Snapshot `renders schema snapshot 1` mismatch'
    ]);

    vi.spyOn(applyCommand, 'runApply').mockImplementation(async () => {
      console.log(JSON.stringify({
        schemaVersion: '1.0',
        command: 'apply',
        ok: true,
        exitCode: 0,
        results: [{ id: 'task-123', file: 'packages/cli/src/commands/schema.test.ts', ruleId: 'test-triage.snapshot-refresh', status: 'applied' }],
        summary: { applied: 1, skipped: 0, unsupported: 0, failed: 0 }
      }));
      return ExitCode.Success;
    });
    mockedRunSpawnSync.mockReturnValue({ status: 0, stdout: '', stderr: '', pid: 1, output: ['', '', ''], signal: null } as never);

    const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const exitCode = await runTestAutofix(repo, { format: 'json', quiet: false, input: 'failure.log' });
    const payload = JSON.parse(String(spy.mock.calls.at(-1)?.[0])) as Record<string, any>;

    expect(exitCode).toBe(ExitCode.Success);
    expect(payload.final_status).toBe('fixed');
    expect(payload.run_id).toBe('test-autofix-run-0001');
    expect(payload.applied_task_ids).toEqual(['task-123']);
    expect(payload.source_apply.path).toBe('.playbook/test-autofix-apply.json');
    expect(payload.executed_verification_commands.map((entry: { command: string }) => entry.command)).toEqual([
      'pnpm --filter @fawxzzy/playbook exec vitest run packages/cli/src/commands/schema.test.ts',
      'pnpm --filter @fawxzzy/playbook test',
      'pnpm -r test'
    ]);
    expect(mockedRunSpawnSync).toHaveBeenCalledTimes(3);

    const written = JSON.parse(fs.readFileSync(path.join(repo, '.playbook', 'test-autofix.json'), 'utf8')) as { data: { final_status: string; source_triage: { path: string } } };
    expect(written.data.final_status).toBe('fixed');
    expect(written.data.source_triage.path).toBe('.playbook/test-triage.json');

    const history = JSON.parse(fs.readFileSync(path.join(repo, '.playbook', 'test-autofix-history.json'), 'utf8')) as { data: { runs: Array<Record<string, any>> } };
    expect(history.data.runs).toHaveLength(1);
    expect(history.data.runs[0]?.files_touched).toEqual(['packages/cli/src/commands/schema.test.ts']);
    expect(history.data.runs[0]?.failure_signatures).toHaveLength(1);
  });

  it('maps repeated equivalent runs to the same failure signature in history', async () => {
    const repo = createRepo();
    vi.spyOn(applyCommand, 'runApply').mockImplementation(async () => {
      console.log(JSON.stringify({
        schemaVersion: '1.0',
        command: 'apply',
        ok: true,
        exitCode: 0,
        results: [{ id: 'task-123', file: 'packages/cli/src/commands/schema.test.ts', ruleId: 'test-triage.snapshot-refresh', status: 'applied' }],
        summary: { applied: 1, skipped: 0, unsupported: 0, failed: 0 }
      }));
      return ExitCode.Success;
    });
    mockedRunSpawnSync.mockReturnValue({ status: 0, stdout: '', stderr: '', pid: 1, output: ['', '', ''], signal: null } as never);

    writeFailureLog(repo, [
      '@fawxzzy/playbook test: FAIL  packages/cli/src/commands/schema.test.ts',
      '  × renders schema snapshot',
      '    Snapshot `renders schema snapshot 1` mismatch'
    ]);
    await runTestAutofix(repo, { format: 'json', quiet: false, input: 'failure.log' });

    writeFailureLog(repo, [
      '@fawxzzy/playbook test: FAIL  packages/cli/src/commands/schema.test.ts',
      '  × renders schema snapshot ',
      '    Snapshot `renders schema snapshot 2` mismatch'
    ]);
    await runTestAutofix(repo, { format: 'json', quiet: false, input: 'failure.log' });

    const history = JSON.parse(fs.readFileSync(path.join(repo, '.playbook', 'test-autofix-history.json'), 'utf8')) as { data: { runs: Array<Record<string, any>> } };
    expect(history.data.runs).toHaveLength(2);
    expect(history.data.runs[0]?.failure_signatures).toEqual(history.data.runs[1]?.failure_signatures);
  });

  it('stops without mutation for review-required-only findings and records the failed remediation run', async () => {
    const repo = createRepo();
    writeFailureLog(repo, [
      'Error: Cannot find module @esbuild/linux-x64',
      'ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL @fawxzzy/playbook test: `node ./scripts/run-tests.mjs`'
    ]);

    const applySpy = vi.spyOn(applyCommand, 'runApply');
    const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const exitCode = await runTestAutofix(repo, { format: 'json', quiet: false, input: 'failure.log' });
    const payload = JSON.parse(String(spy.mock.calls.at(-1)?.[0])) as Record<string, any>;

    expect(exitCode).toBe(ExitCode.Success);
    expect(payload.final_status).toBe('review_required_only');
    expect(payload.apply_result.attempted).toBe(false);
    expect(applySpy).not.toHaveBeenCalled();
    expect(mockedRunSpawnSync).not.toHaveBeenCalled();

    const history = JSON.parse(fs.readFileSync(path.join(repo, '.playbook', 'test-autofix-history.json'), 'utf8')) as { data: { runs: Array<Record<string, any>> } };
    expect(history.data.runs[0]?.final_status).toBe('review_required_only');
    expect(history.data.runs[0]?.provenance.apply_result_path).toBeNull();
  });

  it('classifies apply failures as blocked', async () => {
    const repo = createRepo();
    writeFailureLog(repo, [
      '@fawxzzy/playbook test: FAIL  packages/cli/src/commands/schema.test.ts',
      '  × renders schema snapshot',
      '    Snapshot `renders schema snapshot 1` mismatch'
    ]);

    vi.spyOn(applyCommand, 'runApply').mockImplementation(async () => {
      console.log(JSON.stringify({
        schemaVersion: '1.0',
        command: 'apply',
        ok: false,
        exitCode: 1,
        message: 'handler failed',
        results: [{ id: 'task-123', file: 'packages/cli/src/commands/schema.test.ts', ruleId: 'test-triage.snapshot-refresh', status: 'failed' }],
        summary: { applied: 0, skipped: 0, unsupported: 0, failed: 1 }
      }));
      return ExitCode.Failure;
    });

    const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const exitCode = await runTestAutofix(repo, { format: 'json', quiet: false, input: 'failure.log' });
    const payload = JSON.parse(String(spy.mock.calls.at(-1)?.[0])) as Record<string, any>;

    expect(exitCode).toBe(ExitCode.Failure);
    expect(payload.final_status).toBe('blocked');
    expect(payload.verification_result.attempted).toBe(false);
    expect(mockedRunSpawnSync).not.toHaveBeenCalled();
  });

  it('classifies verification failures after apply as partially_fixed', async () => {
    const repo = createRepo();
    writeFailureLog(repo, [
      '@fawxzzy/playbook test: FAIL  packages/cli/src/commands/schema.test.ts',
      '  × renders schema snapshot',
      '    Snapshot `renders schema snapshot 1` mismatch'
    ]);

    vi.spyOn(applyCommand, 'runApply').mockImplementation(async () => {
      console.log(JSON.stringify({
        schemaVersion: '1.0',
        command: 'apply',
        ok: true,
        exitCode: 0,
        results: [{ id: 'task-123', file: 'packages/cli/src/commands/schema.test.ts', ruleId: 'test-triage.snapshot-refresh', status: 'applied' }],
        summary: { applied: 1, skipped: 0, unsupported: 0, failed: 0 }
      }));
      return ExitCode.Success;
    });
    mockedRunSpawnSync
      .mockReturnValueOnce({ status: 0, stdout: '', stderr: '', pid: 1, output: ['', '', ''], signal: null } as never)
      .mockReturnValueOnce({ status: 1, stdout: '', stderr: '', pid: 1, output: ['', '', ''], signal: null } as never);

    const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const exitCode = await runTestAutofix(repo, { format: 'json', quiet: false, input: 'failure.log' });
    const payload = JSON.parse(String(spy.mock.calls.at(-1)?.[0])) as Record<string, any>;

    expect(exitCode).toBe(ExitCode.Failure);
    expect(payload.final_status).toBe('partially_fixed');
    expect(payload.executed_verification_commands).toHaveLength(2);
    expect(payload.executed_verification_commands[1].ok).toBe(false);
    expect(mockedRunSpawnSync).toHaveBeenCalledTimes(2);
  });
});

describe('command registry', () => {
  it('registers the test-autofix command', () => {
    const command = listRegisteredCommands().find((entry) => entry.name === 'test-autofix');
    expect(command).toBeDefined();
    expect(command?.description).toBe('Orchestrate deterministic test diagnosis, bounded repair, apply, and narrow-first verification');
  });
});
