import { generateRepositoryHealth } from '@zachariahredfield/playbook-engine';
import fs from 'node:fs';
import path from 'node:path';
import { ExitCode } from '../lib/cliContract.js';
import { hasRegisteredCommand } from './index.js';
import { runSchema } from './schema.js';
import { doctorFixes } from '../lib/doctorFixes.js';
import { loadVerifyRules } from '../lib/loadVerifyRules.js';

type DoctorOptions = {
  format: 'text' | 'json';
  quiet: boolean;
  fix: boolean;
  dryRun: boolean;
  yes: boolean;
  ai: boolean;
};

export type DoctorReport = ReturnType<typeof generateRepositoryHealth>;

type DoctorFixApplied = {
  id: string;
  description: string;
  changes: string[];
};

type DoctorFixSkipped = {
  id: string;
  reason: string;
};

type AiDoctorCheck = {
  name: 'schema' | 'context' | 'repoIndex' | 'verifyRules';
  status: 'pass' | 'warn' | 'fail';
  message: string;
};

const toExitCode = (): ExitCode => ExitCode.Success;

export const collectDoctorReport = async (cwd: string): Promise<DoctorReport> => generateRepositoryHealth(cwd);

const printHealthReport = (report: DoctorReport, safeFixCount: number): void => {
  const statusIcon = (ok: boolean): string => (ok ? '✔' : '⚠');

  console.log('Repository Health');
  console.log('─────────────────');
  console.log('');
  console.log(`Framework: ${report.framework}`);
  console.log(`Language: ${report.language}`);
  console.log(`Architecture: ${report.architecture}`);
  console.log('');
  console.log('Governance');
  console.log('──────────');
  console.log('');

  for (const item of report.governanceStatus) {
    console.log(`${statusIcon(item.ok)} ${item.message}`);
  }

  console.log('');
  console.log('Automation');
  console.log('──────────');
  console.log('');
  console.log(`${safeFixCount} safe fixes available`);

  if (report.suggestedActions.length > 0) {
    console.log('');
    console.log('Run:');
    for (const action of report.suggestedActions) {
      console.log(action);
    }
  }
};

const printJsonReport = (report: DoctorReport): void => {
  console.log(
    JSON.stringify(
      {
        command: 'doctor',
        framework: report.framework,
        architecture: report.architecture,
        issues: report.issues,
        suggestedActions: report.suggestedActions
      },
      null,
      2
    )
  );
};

const getSafeFixCount = async (cwd: string, dryRun: boolean): Promise<number> => {
  let count = 0;

  for (const fix of doctorFixes) {
    const result = await fix.check({ cwd, dryRun });
    if (result.applicable && fix.safeToAutoApply) {
      count += 1;
    }
  }

  return count;
};

const runAiChecks = async (cwd: string): Promise<AiDoctorCheck[]> => {
  const checks: AiDoctorCheck[] = [];

  const schemaExitCode = await runSchema(cwd, [], { format: 'text', quiet: true });
  checks.push({
    name: 'schema',
    status: schemaExitCode === ExitCode.Success ? 'pass' : 'fail',
    message: 'Playbook schema available'
  });

  checks.push({
    name: 'context',
    status: hasRegisteredCommand('context') ? 'pass' : 'fail',
    message: 'Playbook context command available'
  });

  const repoIndexPath = path.join(cwd, '.playbook', 'repo-index.json');
  checks.push({
    name: 'repoIndex',
    status: fs.existsSync(repoIndexPath) ? 'pass' : 'warn',
    message: fs.existsSync(repoIndexPath) ? 'Repository intelligence generated' : 'Repository intelligence not generated'
  });

  const verifyRules = await loadVerifyRules(cwd);
  checks.push({
    name: 'verifyRules',
    status: verifyRules.length > 0 ? 'pass' : 'fail',
    message: verifyRules.length > 0 ? 'Verify rules loaded' : 'Verify rules unavailable'
  });

  return checks;
};

const printAiTextReport = (checks: AiDoctorCheck[]): void => {
  const iconByStatus = {
    pass: '✓',
    warn: '⚠',
    fail: '✗'
  } as const;

  console.log('AI Environment Check');
  console.log('────────────────────');
  console.log('');

  for (const check of checks) {
    console.log(`${iconByStatus[check.status]} ${check.message}`);
  }

  if (checks.some((check) => check.name === 'repoIndex' && check.status === 'warn')) {
    console.log('');
    console.log('Suggested action:');
    console.log('Run `playbook index` to generate repository intelligence.');
  }
};

export const runDoctor = async (cwd: string, options: DoctorOptions): Promise<number> => {
  if (options.ai) {
    const checks = await runAiChecks(cwd);

    if (options.format === 'json') {
      console.log(
        JSON.stringify(
          {
            schemaVersion: '1.0',
            command: 'doctor',
            mode: 'ai',
            checks: checks.map((check) => ({ name: check.name, status: check.status }))
          },
          null,
          2
        )
      );
      return toExitCode();
    }

    if (!options.quiet) {
      printAiTextReport(checks);
    }

    return toExitCode();
  }

  const report = await collectDoctorReport(cwd);

  if (!options.fix) {
    if (options.format === 'json') {
      printJsonReport(report);
    } else if (!(options.quiet && report.issues.length === 0 && report.verifySummary.failures === 0)) {
      const safeFixCount = await getSafeFixCount(cwd, options.dryRun);
      printHealthReport(report, safeFixCount);
    }

    return toExitCode();
  }

  const plan: Array<{ id: string; description: string; safeToAutoApply: boolean }> = [];

  for (const fix of doctorFixes) {
    const result = await fix.check({ cwd, dryRun: options.dryRun });
    if (result.applicable) {
      plan.push({ id: fix.id, description: fix.description, safeToAutoApply: fix.safeToAutoApply });
    }
  }

  const shouldApply = !options.dryRun && options.yes;
  const applied: DoctorFixApplied[] = [];
  const skipped: DoctorFixSkipped[] = [];

  for (const entry of plan) {
    const fix = doctorFixes.find((candidate) => candidate.id === entry.id);
    if (!fix) {
      skipped.push({ id: entry.id, reason: 'Fix handler not found.' });
      continue;
    }

    if (!entry.safeToAutoApply) {
      skipped.push({ id: entry.id, reason: 'Fix is not marked safe for auto-apply.' });
      continue;
    }

    if (!shouldApply) {
      skipped.push({
        id: entry.id,
        reason: options.dryRun ? 'Dry-run mode: fix preview only.' : 'Use --yes to apply fixes.'
      });
      continue;
    }

    const result = await fix.fix({ cwd, dryRun: options.dryRun });
    applied.push({ id: fix.id, description: fix.description, changes: result.changes });
  }

  const environment = shouldApply ? await collectDoctorReport(cwd) : report;

  if (options.format === 'json') {
    console.log(
      JSON.stringify(
        {
          schemaVersion: '1.0',
          command: 'doctor',
          summary: shouldApply
            ? `Doctor --fix completed: ${applied.length} applied, ${skipped.length} skipped.`
            : `Doctor --fix preview: ${plan.length} fix(es) available.`,
          applied,
          skipped,
          environment
        },
        null,
        2
      )
    );
    return toExitCode();
  }

  console.log('Doctor fix plan:');
  if (plan.length === 0) {
    console.log('  (no safe deterministic fixes available)');
  } else {
    for (const entry of plan) {
      console.log(`  - ${entry.id}: ${entry.description}`);
    }
  }

  console.log(options.dryRun ? 'Planned changes:' : 'Applied fixes:');
  if (applied.length === 0) {
    console.log('  (none)');
  } else {
    for (const entry of applied) {
      console.log(`  - ${entry.id}: ${entry.description}`);
      for (const change of entry.changes) {
        console.log(`    ${change}`);
      }
    }
  }

  console.log('Skipped fixes:');
  if (skipped.length === 0) {
    console.log('  (none)');
  } else {
    for (const entry of skipped) {
      console.log(`  - ${entry.id}: ${entry.reason}`);
    }
  }

  return toExitCode();
};
