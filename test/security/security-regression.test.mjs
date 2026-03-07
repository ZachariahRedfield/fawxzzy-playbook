import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  redactSecretsForLogs,
  validateRemediationPlan,
  validateRepoBoundary
} from '../../packages/engine/dist/security/guards.js';

const makeRepo = () => fs.mkdtempSync(path.join(os.tmpdir(), 'playbook-security-'));

test('Path Traversal Protection blocks ../../etc/passwd', () => {
  const repo = makeRepo();
  assert.throws(() => validateRepoBoundary(repo, '../../etc/passwd'), /escapes repository root/);
});

test('Repo Boundary Protection blocks writes outside repository root', () => {
  const repo = makeRepo();
  assert.throws(() => {
    validateRemediationPlan(repo, [
      {
        id: 'task-1',
        ruleId: 'notes.missing',
        file: '../outside.md',
        action: 'write file',
        autoFix: true
      }
    ]);
  }, /escapes repository root/);
});

test('Plan Validation rejects malformed plans', () => {
  const repo = makeRepo();
  assert.throws(() => {
    validateRemediationPlan(repo, [
      {
        id: 'task-1',
        ruleId: 'notes.missing',
        file: 'docs/unsafe.exe',
        action: 'x'.repeat(500),
        autoFix: true
      }
    ]);
  }, /action must be between 1 and 400 characters/);
});

test('Secret Redaction removes credentials from log messages', () => {
  const redacted = redactSecretsForLogs('token=super-secret-value ghp_abcdefghijklmnopqrstuvwxyz1234');
  assert.equal(redacted.includes('super-secret-value'), false);
  assert.equal(redacted.includes('ghp_abcdefghijklmnopqrstuvwxyz1234'), false);
  assert.equal(redacted.includes('[REDACTED]'), true);
});
