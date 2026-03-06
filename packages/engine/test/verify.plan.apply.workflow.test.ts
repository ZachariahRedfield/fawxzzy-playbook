import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { applyExecutionPlan, generateExecutionPlan, verifyRepo } from '../src/index.js';

describe('verify -> plan -> apply -> verify workflow', () => {
  it('resolves notes.missing with a fix handler', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'playbook-workflow-'));
    fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
    fs.writeFileSync(path.join(root, 'docs', 'PROJECT_GOVERNANCE.md'), '# Governance\n');

    const initialVerify = verifyRepo(root);
    expect(initialVerify.ok).toBe(false);
    expect(initialVerify.failures.map((failure) => failure.id)).toContain('notes.missing');

    const plan = generateExecutionPlan(root);
    expect(plan.tasks.map((task) => task.ruleId)).toContain('notes.missing');

    const execution = await applyExecutionPlan(
      root,
      plan.tasks,
      {
        'notes.missing': async ({ repoRoot, dryRun }) => {
          if (!dryRun) {
            fs.writeFileSync(path.join(repoRoot, 'docs', 'PLAYBOOK_NOTES.md'), '# Playbook Notes\n\n- added\n');
          }
          return {
            filesChanged: ['docs/PLAYBOOK_NOTES.md'],
            summary: 'Created notes file'
          };
        }
      },
      { dryRun: false }
    );

    expect(execution.applied.map((item) => item.ruleId)).toContain('notes.missing');

    const finalVerify = verifyRepo(root);
    expect(finalVerify.ok).toBe(true);
  });
});
