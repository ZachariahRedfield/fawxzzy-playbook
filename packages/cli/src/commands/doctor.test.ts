import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ExitCode } from '../lib/cliContract.js';

const generateRepositoryHealth = vi.fn();
const runSchema = vi.fn();
const hasRegisteredCommand = vi.fn();
const loadVerifyRules = vi.fn();
const existsSync = vi.fn();

const doctorFixes = [
  {
    id: 'doctor.fix.docs.directory',
    description: 'Ensure docs/ directory exists.',
    safeToAutoApply: true,
    check: vi.fn(async () => ({ applicable: true })),
    fix: vi.fn(async () => ({ changes: ['docs/'] }))
  },
  {
    id: 'doctor.fix.config.file',
    description: 'Repair missing playbook.config.json using Playbook defaults.',
    safeToAutoApply: true,
    check: vi.fn(async () => ({ applicable: false })),
    fix: vi.fn(async () => ({ changes: ['playbook.config.json'] }))
  }
];

vi.mock('@zachariahredfield/playbook-engine', () => ({
  generateRepositoryHealth
}));

vi.mock('node:fs', () => ({
  default: { existsSync },
  existsSync
}));

vi.mock('./schema.js', () => ({
  runSchema
}));

vi.mock('./index.js', async () => {
  const actual = await vi.importActual('./index.js');
  return {
    ...(actual as object),
    hasRegisteredCommand
  };
});

vi.mock('../lib/loadVerifyRules.js', () => ({
  loadVerifyRules
}));

vi.mock('../lib/doctorFixes.js', () => ({
  doctorFixes
}));

const healthyReport = {
  framework: 'Next.js',
  language: 'TypeScript',
  architecture: 'Modular Monolith',
  governanceStatus: [
    { id: 'playbook-config', ok: true, message: 'Playbook config detected' },
    { id: 'architecture-docs', ok: true, message: 'Architecture docs present' },
    { id: 'checklist-verify-step', ok: true, message: 'PLAYBOOK_CHECKLIST includes verify step' },
    { id: 'repo-index', ok: true, message: 'Repo index up to date' }
  ],
  verifySummary: { ok: true, failures: 0, warnings: 0 },
  suggestedActions: [],
  issues: []
};

describe('runDoctor', () => {
  beforeEach(() => {
    generateRepositoryHealth.mockReset();
    runSchema.mockReset();
    hasRegisteredCommand.mockReset();
    loadVerifyRules.mockReset();
    existsSync.mockReset();
    doctorFixes[0].check.mockClear();
    doctorFixes[1].check.mockClear();
  });

  it('prints repository health text output', async () => {
    const { runDoctor } = await import('./doctor.js');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    generateRepositoryHealth.mockReturnValue(healthyReport);

    const exitCode = await runDoctor(process.cwd(), {
      format: 'text',
      quiet: false,
      fix: false,
      dryRun: false,
      yes: false,
      ai: false
    });

    const output = logSpy.mock.calls.map((call) => String(call[0])).join('\n');
    expect(exitCode).toBe(ExitCode.Success);
    expect(output).toContain('Repository Health');
    expect(output).toContain('Framework: Next.js');
    expect(output).toContain('Automation');
    expect(output).toContain('1 safe fixes available');

    logSpy.mockRestore();
  });

  it('prints doctor json contract output', async () => {
    const { runDoctor } = await import('./doctor.js');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    generateRepositoryHealth.mockReturnValue({
      ...healthyReport,
      issues: ['Repo index outdated'],
      suggestedActions: ['playbook analyze']
    });

    const exitCode = await runDoctor(process.cwd(), {
      format: 'json',
      quiet: false,
      fix: false,
      dryRun: false,
      yes: false,
      ai: false
    });

    const payload = JSON.parse(String(logSpy.mock.calls[0]?.[0]));
    expect(exitCode).toBe(ExitCode.Success);
    expect(payload).toEqual({
      command: 'doctor',
      framework: 'Next.js',
      architecture: 'Modular Monolith',
      issues: ['Repo index outdated'],
      suggestedActions: ['playbook analyze']
    });

    logSpy.mockRestore();
  });

  it('prints doctor --ai text output when repo index exists', async () => {
    const { runDoctor } = await import('./doctor.js');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    runSchema.mockResolvedValue(ExitCode.Success);
    hasRegisteredCommand.mockReturnValue(true);
    existsSync.mockReturnValue(true);
    loadVerifyRules.mockResolvedValue([{ id: 'rule-1' }]);

    const exitCode = await runDoctor(process.cwd(), {
      format: 'text',
      quiet: false,
      fix: false,
      dryRun: false,
      yes: false,
      ai: true
    });

    const output = logSpy.mock.calls.map((call) => String(call[0])).join('\n');
    expect(exitCode).toBe(ExitCode.Success);
    expect(output).toContain('AI Environment Check');
    expect(output).toContain('✓ Playbook schema available');
    expect(output).toContain('✓ Playbook context command available');
    expect(output).toContain('✓ Repository intelligence generated');
    expect(output).toContain('✓ Verify rules loaded');

    logSpy.mockRestore();
  });

  it('prints doctor --ai --json output when repo index is missing', async () => {
    const { runDoctor } = await import('./doctor.js');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    runSchema.mockResolvedValue(ExitCode.Success);
    hasRegisteredCommand.mockReturnValue(true);
    existsSync.mockReturnValue(false);
    loadVerifyRules.mockResolvedValue([{ id: 'rule-1' }]);

    const exitCode = await runDoctor(process.cwd(), {
      format: 'json',
      quiet: false,
      fix: false,
      dryRun: false,
      yes: false,
      ai: true
    });

    const payload = JSON.parse(String(logSpy.mock.calls[0]?.[0]));
    expect(exitCode).toBe(ExitCode.Success);
    expect(payload).toEqual({
      schemaVersion: '1.0',
      command: 'doctor',
      mode: 'ai',
      checks: [
        { name: 'schema', status: 'pass' },
        { name: 'context', status: 'pass' },
        { name: 'repoIndex', status: 'warn' },
        { name: 'verifyRules', status: 'pass' }
      ]
    });

    logSpy.mockRestore();
  });

  it('fails verify rules check when registry is empty', async () => {
    const { runDoctor } = await import('./doctor.js');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    runSchema.mockResolvedValue(ExitCode.Success);
    hasRegisteredCommand.mockReturnValue(true);
    existsSync.mockReturnValue(true);
    loadVerifyRules.mockResolvedValue([]);

    const exitCode = await runDoctor(process.cwd(), {
      format: 'json',
      quiet: false,
      fix: false,
      dryRun: false,
      yes: false,
      ai: true
    });

    const payload = JSON.parse(String(logSpy.mock.calls[0]?.[0]));
    expect(exitCode).toBe(ExitCode.Success);
    expect(payload.checks).toContainEqual({ name: 'verifyRules', status: 'fail' });

    logSpy.mockRestore();
  });

  it('fails context check when context command is missing', async () => {
    const { runDoctor } = await import('./doctor.js');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    runSchema.mockResolvedValue(ExitCode.Success);
    hasRegisteredCommand.mockReturnValue(false);
    existsSync.mockReturnValue(true);
    loadVerifyRules.mockResolvedValue([{ id: 'rule-1' }]);

    const exitCode = await runDoctor(process.cwd(), {
      format: 'json',
      quiet: false,
      fix: false,
      dryRun: false,
      yes: false,
      ai: true
    });

    const payload = JSON.parse(String(logSpy.mock.calls[0]?.[0]));
    expect(exitCode).toBe(ExitCode.Success);
    expect(payload.checks).toContainEqual({ name: 'context', status: 'fail' });

    logSpy.mockRestore();
  });
});
