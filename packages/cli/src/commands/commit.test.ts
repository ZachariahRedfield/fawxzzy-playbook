import { describe, expect, it, vi } from 'vitest';
import { ExitCode } from '../lib/cliContract.js';
import { listRegisteredCommands } from './index.js';

const spawnSyncMock = vi.fn();

vi.mock('node:child_process', () => ({
  spawnSync: (...args: unknown[]) => spawnSyncMock(...args)
}));

describe('runCommit', () => {
  it('runs release sync, stages all, and passes through git commit args', async () => {
    const { runCommit } = await import('./commit.js');
    spawnSyncMock.mockReturnValue({ status: 0 });

    const exitCode = await runCommit('/repo', ['-m', 'test commit'], { format: 'text', quiet: false });

    expect(exitCode).toBe(ExitCode.Success);
    expect(spawnSyncMock).toHaveBeenNthCalledWith(1, 'pnpm', ['playbook', 'release', 'sync'], { cwd: '/repo', stdio: 'inherit' });
    expect(spawnSyncMock).toHaveBeenNthCalledWith(2, 'git', ['add', '-A'], { cwd: '/repo', stdio: 'inherit' });
    expect(spawnSyncMock).toHaveBeenNthCalledWith(3, 'git', ['commit', '-m', 'test commit'], { cwd: '/repo', stdio: 'inherit' });
  });

  it('returns failure when release sync fails', async () => {
    const { runCommit } = await import('./commit.js');
    spawnSyncMock.mockReset();
    spawnSyncMock.mockReturnValueOnce({ status: 1 });

    const exitCode = await runCommit('/repo', ['-m', 'test commit'], { format: 'text', quiet: false });
    expect(exitCode).toBe(ExitCode.Failure);
    expect(spawnSyncMock).toHaveBeenCalledTimes(1);
  });

  it('registers commit command', () => {
    const command = listRegisteredCommands().find((entry) => entry.name === 'commit');
    expect(command).toBeDefined();
    expect(command?.description).toContain('release sync');
  });
});

