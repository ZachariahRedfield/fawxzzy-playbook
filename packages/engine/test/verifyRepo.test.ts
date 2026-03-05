import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { verifyRepo } from '../src/verify/index.js';

const writeConfig = (root: string) => {
  fs.writeFileSync(path.join(root, 'playbook.config.json'), JSON.stringify({ version: 1 }));
};

describe('verifyRepo governance notes rule', () => {
  it('fails when governance exists and notes file is missing', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'playbook-verify-test-'));
    writeConfig(root);
    fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
    fs.writeFileSync(path.join(root, 'docs/PROJECT_GOVERNANCE.md'), '# governance\n');

    const report = verifyRepo(root);

    expect(report.ok).toBe(false);
    expect(report.failures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'notes.missing',
          path: 'docs/PLAYBOOK_NOTES.md'
        })
      ])
    );
  });

  it('passes when governance exists and notes file is non-empty', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'playbook-verify-test-'));
    writeConfig(root);
    fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
    fs.writeFileSync(path.join(root, 'docs/PROJECT_GOVERNANCE.md'), '# governance\n');
    fs.writeFileSync(path.join(root, 'docs/PLAYBOOK_NOTES.md'), 'updated notes\n');

    const report = verifyRepo(root);

    expect(report.failures.find((failure) => failure.id === 'notes.missing')).toBeUndefined();
  });
});
