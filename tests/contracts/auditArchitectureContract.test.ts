import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

type AuditArchitecturePayload = {
  schemaVersion: '1.0';
  command: 'audit-architecture';
  ok: boolean;
  summary: {
    status: 'pass' | 'warn' | 'fail';
    checks: number;
    pass: number;
    warn: number;
    fail: number;
  };
  audits: Array<{
    id: string;
    title: string;
    status: 'pass' | 'warn' | 'fail';
    severity: 'low' | 'medium' | 'high';
    evidence: string[];
    recommendation: string;
  }>;
  nextActions: string[];
};

const repoRoot = path.resolve(import.meta.dirname, '..', '..');
const cliEntry = path.join(repoRoot, 'packages', 'cli', 'dist', 'main.js');

const runCli = (cwd: string, args: string[]): ReturnType<typeof spawnSync> =>
  spawnSync(process.execPath, [cliEntry, ...args], {
    cwd,
    encoding: 'utf8'
  });

const createFixtureRepo = (): string => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'playbook-audit-architecture-contract-'));
  fs.writeFileSync(path.join(repo, 'package.json'), JSON.stringify({ name: 'playbook-audit-architecture-contract' }, null, 2));
  fs.mkdirSync(path.join(repo, 'docs', 'architecture'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'docs', 'architecture', 'REMEDIATION_TRUST_MODEL.md'), '# Trust\n\nNo bounded levels here.\n');
  fs.writeFileSync(path.join(repo, 'docs', 'PLAYBOOK_PRODUCT_ROADMAP.md'), '# Product roadmap\n\nNo platform hardening section.\n');

  fs.mkdirSync(path.join(repo, '.playbook'), { recursive: true });
  fs.writeFileSync(path.join(repo, '.playbook', 'repo-index.json'), JSON.stringify({ command: 'index' }, null, 2));
  fs.writeFileSync(path.join(repo, '.playbook', 'repo-graph.json'), JSON.stringify({ schemaVersion: '1.0', command: 'graph' }, null, 2));

  return repo;
};

const createRoadmapToleranceFixture = (): string => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'playbook-audit-architecture-roadmap-'));
  fs.writeFileSync(path.join(repo, 'package.json'), JSON.stringify({ name: 'playbook-audit-roadmap-tolerance' }, null, 2));
  fs.mkdirSync(path.join(repo, 'docs'), { recursive: true });
  fs.writeFileSync(
    path.join(repo, 'docs', 'PLAYBOOK_PRODUCT_ROADMAP.md'),
    [
      '# Product roadmap',
      '',
      '## Architecture guardrails coverage',
      '- artifact evolution policy and schema version lifecycle',
      '- shared git context layer and scm normalization plan',
      '- remediation trust model with bounded scope levels',
      '- incremental narrow context retrieval with token-aware budget controls',
      '- repeatable architecture audit hardening controls'
    ].join('\n')
  );
  return repo;
};

const expectedAuditIds = [
  'ai.determinism-boundary',
  'artifact.evolution-policy',
  'artifact.schema-versioning',
  'docs.roadmap-coverage',
  'ecosystem.adapter-boundaries',
  'performance.context-efficiency',
  'remediation.trust-model',
  'scm.context-layer'
];

describe('audit architecture contract', () => {
  it('emits stable JSON contract fields, IDs, and deterministic nextActions', () => {
    const fixtureRepo = createFixtureRepo();

    try {
      const result = runCli(fixtureRepo, ['audit', 'architecture', '--json']);
      expect(result.status).toBe(0);

      const payload = JSON.parse(result.stdout.trim()) as AuditArchitecturePayload;
      expect(payload.schemaVersion).toBe('1.0');
      expect(payload.command).toBe('audit-architecture');
      expect(payload.summary.checks).toBe(expectedAuditIds.length);
      expect(payload.summary.status).toBe('warn');
      expect(payload.summary.fail).toBe(0);
      expect(payload.audits.map((audit) => audit.id)).toEqual(expectedAuditIds);
      expect(payload.audits.every((audit) => ['pass', 'warn', 'fail'].includes(audit.status))).toBe(true);
      expect(payload.nextActions).toEqual([
        'ai.determinism-boundary: Update docs/architecture/AI_DETERMINISM_BOUNDARY.md to define where AI assistance ends and deterministic source-of-truth enforcement begins.',
        'artifact.evolution-policy: Create docs/contracts/ARTIFACT_EVOLUTION_POLICY.md with schema evolution, compatibility, and regeneration guidance.',
        'artifact.schema-versioning: Ensure all persisted artifacts include a top-level schemaVersion (missing: .playbook/repo-index.json).',
        'docs.roadmap-coverage: Add roadmap hardening coverage for artifact versioning/evolution, SCM normalization context, remediation trust scope boundaries, context/token efficiency, and repeatable architecture audit controls.',
        'ecosystem.adapter-boundaries: Create or update docs/architecture/ECOSYSTEM_ADAPTERS.md to define external tool isolation and adapter boundary contracts.',
        'performance.context-efficiency: Create or update docs/architecture/CONTEXT_EFFICIENCY_STRATEGY.md with deterministic context/token efficiency patterns.',
        'remediation.trust-model: Document deterministic remediation trust boundaries and explicit change levels in docs/architecture/REMEDIATION_TRUST_MODEL.md.',
        'scm.context-layer: Centralize SCM normalization in shared git-context utilities and document boundaries in docs/architecture/SCM_CONTEXT_LAYER.md.'
      ]);
      expect(payload.audits.every((audit) => [...audit.evidence].sort((left, right) => left.localeCompare(right)).every((value, idx) => value === audit.evidence[idx]))).toBe(true);
    } finally {
      fs.rmSync(fixtureRepo, { recursive: true, force: true });
    }
  });

  it('uses tolerant concept-based roadmap coverage matching', () => {
    const fixtureRepo = createRoadmapToleranceFixture();

    try {
      const result = runCli(fixtureRepo, ['audit', 'architecture', '--json']);
      expect(result.status).toBe(0);
      const payload = JSON.parse(result.stdout.trim()) as AuditArchitecturePayload;
      const roadmapAudit = payload.audits.find((audit) => audit.id === 'docs.roadmap-coverage');
      expect(roadmapAudit).toBeDefined();
      expect(roadmapAudit?.status).toBe('pass');
      expect(roadmapAudit?.evidence.some((line) => line.includes('roadmap covers required hardening concepts'))).toBe(true);
    } finally {
      fs.rmSync(fixtureRepo, { recursive: true, force: true });
    }
  });
});
