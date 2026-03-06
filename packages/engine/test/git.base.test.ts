import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { isGitRepository, resolveDiffBase } from '../src/git/base.js';

describe('git base resolution in non-git directories', () => {
  it('reports non-git capability deterministically', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'playbook-non-git-'));

    expect(isGitRepository(root)).toBe(false);
    expect(resolveDiffBase(root)).toEqual({
      warning: 'Repository is not a git work tree; skipping diff-based verification checks.'
    });
  });

  it('does not emit raw git fatal stderr noise when checking capability', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'playbook-non-git-stderr-'));
    const stderrSpy = vi.spyOn(process.stderr, 'write');

    expect(resolveDiffBase(root)).toEqual({
      warning: 'Repository is not a git work tree; skipping diff-based verification checks.'
    });

    const stderrOutput = stderrSpy.mock.calls
      .map(([chunk]) => String(chunk))
      .join('');

    expect(stderrOutput).not.toContain('fatal: not a git repository');

    stderrSpy.mockRestore();
  });
});
