import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { execSync } from 'node:child_process';
import {
  applyExecutionPlan,
  captureMemoryEvent,
  computeMemoryEventFingerprint,
  generateExecutionPlan,
  verifyRepo,
  analyzePullRequest
} from '../src/index.js';
import { verifyMemoryEventFixture } from './__fixtures__/memoryEvent.fixture.js';

const readJson = <T>(filePath: string): T => JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;

const classifyFindingForTest = (ruleId: string): string => {
  if (ruleId === 'playbook.pr.risk.module') return 'module-risk';
  if (ruleId.startsWith('PLAYBOOK_DOCS_') || ruleId.startsWith('PB007') || ruleId.startsWith('PB009')) return 'documentation';
  if (ruleId.startsWith('PB')) return 'governance-rule';
  return 'general-review';
};

const initGitRepo = (root: string): void => {
  const run = (cmd: string) => {
    execSync(cmd, { cwd: root, stdio: 'ignore' });
  };

  run('git init');
  run('git config user.email "playbook@example.com"');
  run('git config user.name "Playbook Test"');
  run('git add .');
  run('git commit -m "initial"');
};

describe('memory event capture', () => {
  it('computes deterministic fingerprints from semantic payloads', () => {
    const fingerprintA = computeMemoryEventFingerprint(verifyMemoryEventFixture);

    const fingerprintB = computeMemoryEventFingerprint({
      ...verifyMemoryEventFixture,
      subjectModules: [...verifyMemoryEventFixture.subjectModules].reverse(),
      ruleIds: [...verifyMemoryEventFixture.ruleIds].reverse(),
      riskSummary: { ...verifyMemoryEventFixture.riskSummary, signals: [...verifyMemoryEventFixture.riskSummary.signals].reverse() }
    });

    expect(fingerprintA).toBe(fingerprintB);
  });

  it('writes deterministic event and index artifacts with stable key ordering', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'playbook-memory-event-'));
    const event = captureMemoryEvent(root, {
      ...verifyMemoryEventFixture,
      subjectModules: ['module-b', 'module-a'],
      ruleIds: ['PB010', 'PB001']
    });

    const eventPath = path.join(root, '.playbook', 'memory', 'events', `${event.eventInstanceId}.json`);
    const indexPath = path.join(root, '.playbook', 'memory', 'index.json');

    expect(fs.existsSync(eventPath)).toBe(true);
    expect(fs.existsSync(indexPath)).toBe(true);

    const eventRaw = fs.readFileSync(eventPath, 'utf8');
    expect(eventRaw.indexOf('"eventFingerprint"')).toBeLessThan(eventRaw.indexOf('"kind"'));

    const eventPayload = readJson<Record<string, unknown>>(eventPath);
    expect(eventPayload).toMatchObject({
      schemaVersion: '1.0',
      kind: 'verify_run',
      subjectModules: ['module-a', 'module-b'],
      ruleIds: ['PB001', 'PB010']
    });

    const index = readJson<{ byModule: Record<string, string[]>; byRule: Record<string, string[]>; byFingerprint: Record<string, string[]> }>(indexPath);
    expect(Object.keys(index.byModule)).toEqual(['module-a', 'module-b']);
    expect(Object.keys(index.byRule)).toEqual(['PB001', 'PB010']);
    expect(index.byFingerprint[event.eventFingerprint]).toHaveLength(1);
  });

  it('captures verify, plan, and apply events from execution workflows', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'playbook-memory-workflow-'));
    fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
    fs.writeFileSync(path.join(root, 'docs', 'PROJECT_GOVERNANCE.md'), '# Governance\n');
    initGitRepo(root);

    verifyRepo(root);
    const plan = generateExecutionPlan(root);
    await applyExecutionPlan(root, plan.tasks, { dryRun: false });

    const eventsDir = path.join(root, '.playbook', 'memory', 'events');
    const events = fs.readdirSync(eventsDir).filter((entry) => entry.endsWith('.json'));
    const payloads = events.map((entry) => readJson<{ kind: string }>(path.join(eventsDir, entry)));
    expect(payloads.some((entry) => entry.kind === 'verify_run')).toBe(true);
    expect(payloads.some((entry) => entry.kind === 'plan_run')).toBe(true);
    expect(payloads.some((entry) => entry.kind === 'apply_run')).toBe(true);
  });

  it('captures failure_ingest when analyze-pr fails to bootstrap', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'playbook-memory-analyze-pr-failure-'));

    expect(() => analyzePullRequest(root, { baseRef: 'main' })).toThrow();

    const eventsDir = path.join(root, '.playbook', 'memory', 'events');
    const events = fs.readdirSync(eventsDir).filter((entry) => entry.endsWith('.json'));
    const payloads = events.map((entry) => readJson<{ kind: string }>(path.join(eventsDir, entry)));
    expect(payloads.some((entry) => entry.kind === 'failure_ingest')).toBe(true);
  });

  it('captures analyze-pr evidence-oriented pr_analysis events with stable fingerprints', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'playbook-memory-analyze-pr-success-'));
    fs.mkdirSync(path.join(root, 'src', 'workouts'), { recursive: true });
    fs.mkdirSync(path.join(root, '.playbook'), { recursive: true });

    fs.writeFileSync(path.join(root, 'src', 'workouts', 'index.ts'), 'export const workouts = 1;\n');
    fs.writeFileSync(
      path.join(root, '.playbook', 'repo-index.json'),
      JSON.stringify(
        {
          schemaVersion: '1.0',
          framework: 'node',
          language: 'typescript',
          architecture: 'modular-monolith',
          modules: [{ name: 'workouts', dependencies: [] }],
          dependencies: [],
          workspace: [],
          tests: [],
          configs: [],
          database: 'none',
          rules: ['PB001']
        },
        null,
        2
      )
    );

    initGitRepo(root);
    fs.writeFileSync(path.join(root, 'src', 'workouts', 'index.ts'), 'export const workouts = 2;\n');

    const analysisA = analyzePullRequest(root, { baseRef: 'HEAD' });
    expect(analysisA.command).toBe('analyze-pr');

    const firstEventsDir = path.join(root, '.playbook', 'memory', 'events');
    const firstPrEvent = fs
      .readdirSync(firstEventsDir)
      .filter((entry) => entry.endsWith('.json'))
      .map((entry) => readJson<Record<string, unknown>>(path.join(firstEventsDir, entry)))
      .find((entry) => entry.kind === 'pr_analysis') as { eventFingerprint: string } | undefined;
    expect(firstPrEvent?.eventFingerprint).toBeTruthy();

    fs.rmSync(path.join(root, '.playbook', 'memory'), { recursive: true, force: true });

    const analysisB = analyzePullRequest(root, { baseRef: 'HEAD' });
    expect(analysisB.command).toBe('analyze-pr');

    const eventsDir = path.join(root, '.playbook', 'memory', 'events');
    const events = fs
      .readdirSync(eventsDir)
      .filter((entry) => entry.endsWith('.json'))
      .map((entry) => readJson<Record<string, unknown>>(path.join(eventsDir, entry)))
      .filter((entry) => entry.kind === 'pr_analysis');

    expect(events.length).toBe(1);

    const latest = events[events.length - 1] as {
      sources: Array<{ type: string; reference: string }>;
      salienceInputs: Record<string, unknown>;
      outcome: { status: string };
      eventFingerprint: string;
    };

    expect(latest.outcome.status).toBe('success');
    expect(latest.sources).toEqual(
      expect.arrayContaining([
        { type: 'artifact', reference: '.playbook/analyze-pr.json' },
        { type: 'artifact', reference: '.playbook/repo-index.json' },
        { type: 'artifact', reference: '.playbook/memory/events' }
      ])
    );

    const salience = latest.salienceInputs;
    expect(salience.trigger).toBe('analyze-pr:HEAD');
    expect(salience.evidenceRefs).toEqual(expect.arrayContaining(['.playbook/analyze-pr.json', '.playbook/repo-index.json']));
    const expectedFindingClasses = [...new Set(analysisA.findings.map((finding) => classifyFindingForTest(finding.ruleId)))].sort();
    expect(salience.findingClasses).toEqual(expectedFindingClasses);
    expect(salience.actionClassSummary).toEqual(expect.arrayContaining(['run-verify:2', 'module-impact-review:1']));

    const fingerprints = events.map((entry) => entry.eventFingerprint).filter((value): value is string => typeof value === 'string');
    expect(fingerprints[0]).toBe(firstPrEvent?.eventFingerprint);
  });
});
