import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(import.meta.dirname, '..', '..', '..');
const cliEntry = path.join(repoRoot, 'packages', 'cli', 'dist', 'main.js');
const snapshotDir = path.join(repoRoot, 'tests', 'contracts');
const shouldUpdateSnapshots = process.env.UPDATE_CONTRACT_SNAPSHOTS === '1';

function normalizeDynamicContractString(value: string): string {
  return value
    .replace(/failure_ingest-[0-9a-f-]+/gi, 'failure_ingest-<RUNTIME_EVENT_ID>')
    .replace(/evt_[0-9a-f]+/gi, 'evt_<RUNTIME_EVENT_ID>')
    .replace(/evtfp_[0-9a-f]+/gi, 'evtfp_<RUNTIME_EVENT_FP>');
}

function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n/g, '\n');
}

type CommandContract = {
  file: string;
  args: readonly string[];
  schemaCommand: 'rules' | 'explain' | 'index' | 'graph' | 'verify' | 'plan' | 'context' | 'ai-context' | 'ai-contract' | 'docs' | 'doctor' | 'analyze-pr' | 'contracts' | 'ignore' | 'knowledge';
};

const commandContracts: readonly CommandContract[] = [
  { file: 'rules.snapshot.json', args: ['rules', '--json'], schemaCommand: 'rules' },
  { file: 'index.snapshot.json', args: ['index', '--json'], schemaCommand: 'index' },
  { file: 'graph.snapshot.json', args: ['graph', '--json'], schemaCommand: 'graph' },
  { file: 'explain-PB001.snapshot.json', args: ['explain', 'PB001', '--json'], schemaCommand: 'explain' },
  { file: 'explain-architecture.snapshot.json', args: ['explain', 'architecture', '--json'], schemaCommand: 'explain' },
  { file: 'verify.snapshot.json', args: ['verify', '--json'], schemaCommand: 'verify' },
  { file: 'plan.snapshot.json', args: ['plan', '--json'], schemaCommand: 'plan' },
  { file: 'context.snapshot.json', args: ['context', '--json'], schemaCommand: 'context' },
  { file: 'ai-context.snapshot.json', args: ['ai-context', '--json'], schemaCommand: 'ai-context' },
  { file: 'ai-contract.snapshot.json', args: ['ai-contract', '--json'], schemaCommand: 'ai-contract' },
  { file: 'docs-audit.snapshot.json', args: ['docs', 'audit', '--json'], schemaCommand: 'docs' },
  { file: 'doctor.snapshot.json', args: ['doctor', '--json'], schemaCommand: 'doctor' },
  { file: 'analyze-pr.snapshot.json', args: ['analyze-pr', '--json'], schemaCommand: 'analyze-pr' },
  { file: 'contracts.snapshot.json', args: ['contracts', '--json'], schemaCommand: 'contracts' },
  { file: 'ignore-suggest.snapshot.json', args: ['ignore', 'suggest', '--json'], schemaCommand: 'ignore' },
  { file: 'knowledge-list.snapshot.json', args: ['knowledge', 'list', '--json'], schemaCommand: 'knowledge' },
  { file: 'knowledge-query.snapshot.json', args: ['knowledge', 'query', '--type', 'candidate', '--json'], schemaCommand: 'knowledge' },
  { file: 'knowledge-inspect.snapshot.json', args: ['knowledge', 'inspect', 'pattern-live', '--json'], schemaCommand: 'knowledge' }
] as const;

function writeJson(filePath: string, payload: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function createContractFixtureRepo(): string {
  const fixtureRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'playbook-contract-fixture-'));

  fs.writeFileSync(path.join(fixtureRepo, 'package.json'), JSON.stringify({ name: 'playbook-contract-fixture' }, null, 2));
  fs.mkdirSync(path.join(fixtureRepo, 'src', 'features'), { recursive: true });
  fs.mkdirSync(path.join(fixtureRepo, 'docs', 'contracts'), { recursive: true });
  fs.writeFileSync(path.join(fixtureRepo, 'docs', 'PLAYBOOK_NOTES.md'), '# Playbook Notes\n\n- Baseline fixture notes.\n');
  fs.writeFileSync(
    path.join(fixtureRepo, 'docs', 'contracts', 'command-truth.json'),
    JSON.stringify(
      {
        bootstrapLadder: ['ai-context', 'ai-contract', 'context'],
        remediationLoop: ['verify', 'plan', 'apply', 'verify'],
        canonicalCommands: ['ai-context'],
        compatibilityCommands: ['analyze'],
        utilityCommands: ['demo']
      },
      null,
      2
    )
  );
  fs.mkdirSync(path.join(fixtureRepo, '.playbook', 'runtime', 'current'), { recursive: true });
  fs.writeFileSync(
    path.join(fixtureRepo, '.playbook', 'runtime', 'current', 'ignore-recommendations.json'),
    JSON.stringify(
      {
        schemaVersion: '1.0',
        cycle_id: 'fixture-cycle',
        generated_at: '2026-03-11T00:00:00.000Z',
        recommendation_model: 'deterministic-v1',
        ranking_factors: ['fixture-rank'],
        recommendations: [
          {
            path: '.git/',
            rank: 1,
            class: 'vcs-internal',
            rationale: 'fixture safe default',
            confidence: 0.99,
            expected_scan_impact: {
              estimated_files_reduced: 10,
              estimated_bytes_reduced: 1024,
              impact_level: 'low'
            },
            safety_level: 'safe-default'
          },
          {
            path: 'playwright-report/',
            rank: 2,
            class: 'generated-report',
            rationale: 'fixture safe default',
            confidence: 0.97,
            expected_scan_impact: {
              estimated_files_reduced: 6,
              estimated_bytes_reduced: 2048,
              impact_level: 'low'
            },
            safety_level: 'safe-default'
          },
          {
            path: 'tmp_file.txt',
            rank: 3,
            class: 'temporary-file',
            rationale: 'fixture review-first',
            confidence: 0.61,
            expected_scan_impact: {
              estimated_files_reduced: 1,
              estimated_bytes_reduced: 64,
              impact_level: 'low'
            },
            safety_level: 'review-first'
          }
        ],
        summary: {
          total_recommendations: 3,
          safety_level_counts: {
            'safe-default': 2,
            'likely-safe': 0,
            'review-first': 1
          },
          class_counts: {
            'vcs-internal': 1,
            'build-cache': 0,
            'generated-report': 1,
            'temporary-file': 1,
            'binary-asset': 0,
            unknown: 0
          }
        }
      },
      null,
      2
    )
  );

  writeJson(path.join(fixtureRepo, '.playbook', 'memory', 'events', 'event-1.json'), {
    schemaVersion: '1.0',
    kind: 'verify_run',
    eventInstanceId: 'event-1',
    eventFingerprint: 'fp-1',
    createdAt: '2026-02-01T00:00:00.000Z',
    repoRevision: 'r1',
    sources: [{ type: 'verify', reference: 'verify-1' }],
    subjectModules: ['module-a'],
    ruleIds: ['RULE-1'],
    riskSummary: { level: 'low', signals: [] },
    outcome: { status: 'success', summary: 'ok' },
    salienceInputs: {}
  });
  writeJson(path.join(fixtureRepo, '.playbook', 'memory', 'events', 'event-2.json'), {
    schemaVersion: '1.0',
    kind: 'plan_run',
    eventInstanceId: 'event-2',
    eventFingerprint: 'fp-2',
    createdAt: '2026-02-02T00:00:00.000Z',
    repoRevision: 'r2',
    sources: [{ type: 'plan', reference: 'plan-1' }],
    subjectModules: ['module-b'],
    ruleIds: ['RULE-2'],
    riskSummary: { level: 'medium', signals: [] },
    outcome: { status: 'success', summary: 'ok' },
    salienceInputs: {}
  });
  writeJson(path.join(fixtureRepo, '.playbook', 'memory', 'candidates.json'), {
    schemaVersion: '1.0',
    command: 'memory-replay',
    generatedAt: '2026-02-03T00:00:00.000Z',
    candidates: [
      {
        candidateId: 'cand-live',
        kind: 'pattern',
        title: 'Live candidate',
        summary: 'Needs review',
        clusterKey: 'cluster-live',
        salienceScore: 8,
        salienceFactors: { severity: 1 },
        fingerprint: 'fp-1',
        module: 'module-a',
        ruleId: 'RULE-1',
        failureShape: 'shape-a',
        eventCount: 1,
        provenance: [
          { eventId: 'event-1', sourcePath: '.playbook/memory/events/event-1.json', fingerprint: 'fp-1', runId: 'run-1' }
        ],
        lastSeenAt: '2026-02-03T00:00:00.000Z',
        supersession: { evolutionOrdinal: 1, priorCandidateIds: [], supersedesCandidateIds: [] }
      }
    ]
  });
  writeJson(path.join(fixtureRepo, '.playbook', 'memory', 'knowledge', 'patterns.json'), {
    schemaVersion: '1.0',
    artifact: 'memory-knowledge',
    kind: 'pattern',
    generatedAt: '2026-02-04T00:00:00.000Z',
    entries: [
      {
        knowledgeId: 'pattern-live',
        candidateId: 'cand-live',
        sourceCandidateIds: ['cand-live'],
        sourceEventFingerprints: ['fp-1'],
        kind: 'pattern',
        title: 'Promoted pattern',
        summary: 'Reusable guidance',
        fingerprint: 'fp-1',
        module: 'module-a',
        ruleId: 'RULE-1',
        failureShape: 'shape-a',
        promotedAt: '2026-02-04T00:00:00.000Z',
        provenance: [
          { eventId: 'event-1', sourcePath: '.playbook/memory/events/event-1.json', fingerprint: 'fp-1', runId: 'run-1' }
        ],
        status: 'active',
        supersedes: [],
        supersededBy: []
      }
    ]
  });

  return fixtureRepo;
}

function normalizeContractPayload(value: unknown, fixtureRepo: string): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeContractPayload(entry, fixtureRepo));
  }

  if (value && typeof value === 'object') {
    const objectValue = value as Record<string, unknown>;
    const normalized: Record<string, unknown> = {};

    for (const [key, raw] of Object.entries(objectValue)) {
      if (key === 'timestamp' || key === 'generatedAt' || key === 'cwd' || key === 'repoRoot') {
        continue;
      }

      if (key === 'createdAt' && typeof raw === 'string') {
        normalized[key] = '<TIMESTAMP>';
        continue;
      }

      normalized[key] = normalizeContractPayload(raw, fixtureRepo);
    }

    return normalized;
  }

  if (typeof value === 'string') {
    return normalizeDynamicContractString(
      value
      .replaceAll('\\', '/')
      .replaceAll(fixtureRepo.replaceAll('\\', '/'), '<CONTRACT_FIXTURE_REPO>')
      .replaceAll(repoRoot.replaceAll('\\', '/'), '<REPO_ROOT>')
    );
  }

  return value;
}

function runCli(args: readonly string[], fixtureRepo: string): { stdout: string; stderr: string; status: number | null } {
  const result = spawnSync(process.execPath, [cliEntry, ...args], {
    cwd: fixtureRepo,
    encoding: 'utf8'
  });

  return {
    stdout: result.stdout,
    stderr: result.stderr,
    status: result.status
  };
}

function runCliJsonContract(args: readonly string[], fixtureRepo: string): unknown {
  const result = runCli(args, fixtureRepo);

  const stdout = result.stdout.trim();
  expect(stdout, `Command emitted no stdout for: ${args.join(' ')}\n${result.stderr}`).not.toBe('');

  const jsonStart = stdout.indexOf('{');
  const jsonEnd = stdout.lastIndexOf('}');

  expect(jsonStart, `No JSON payload was emitted for: ${args.join(' ')}`).toBeGreaterThanOrEqual(0);
  expect(jsonEnd, `No JSON payload was emitted for: ${args.join(' ')}`).toBeGreaterThanOrEqual(jsonStart);

  const payload = stdout.slice(jsonStart, jsonEnd + 1);

  return normalizeContractPayload(JSON.parse(payload), fixtureRepo);
}

function toTypeName(value: unknown): string {
  if (Array.isArray(value)) {
    return 'array';
  }
  if (value === null) {
    return 'null';
  }
  if (typeof value === 'number' && Number.isInteger(value)) {
    return 'integer';
  }
  return typeof value;
}

function typeMatches(schemaType: unknown, value: unknown): boolean {
  const typeName = toTypeName(value);
  if (Array.isArray(schemaType)) {
    return schemaType.includes(typeName) || (schemaType.includes('number') && typeName === 'integer');
  }
  return schemaType === typeName || (schemaType === 'number' && typeName === 'integer');
}

function validateAgainstSchema(value: unknown, schema: unknown): boolean {
  if (!schema || typeof schema !== 'object') {
    return true;
  }

  const schemaObject = schema as Record<string, unknown>;

  if (Array.isArray(schemaObject.oneOf)) {
    return schemaObject.oneOf.some((candidate) => validateAgainstSchema(value, candidate));
  }

  if (Object.prototype.hasOwnProperty.call(schemaObject, 'const')) {
    return value === schemaObject.const;
  }

  if (Array.isArray(schemaObject.enum) && !schemaObject.enum.includes(value)) {
    return false;
  }

  if (Object.prototype.hasOwnProperty.call(schemaObject, 'type') && !typeMatches(schemaObject.type, value)) {
    return false;
  }

  if (typeof schemaObject.minProperties === 'number') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return false;
    }
    if (Object.keys(value as Record<string, unknown>).length < schemaObject.minProperties) {
      return false;
    }
  }

  if (Array.isArray(schemaObject.required)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return false;
    }

    const recordValue = value as Record<string, unknown>;
    for (const key of schemaObject.required) {
      if (typeof key !== 'string' || !Object.prototype.hasOwnProperty.call(recordValue, key)) {
        return false;
      }
    }
  }

  if (value && typeof value === 'object' && !Array.isArray(value) && schemaObject.properties && typeof schemaObject.properties === 'object') {
    const properties = schemaObject.properties as Record<string, unknown>;
    const valueRecord = value as Record<string, unknown>;

    for (const [key, propertySchema] of Object.entries(properties)) {
      if (Object.prototype.hasOwnProperty.call(valueRecord, key) && !validateAgainstSchema(valueRecord[key], propertySchema)) {
        return false;
      }
    }

    if (schemaObject.additionalProperties === false) {
      for (const key of Object.keys(valueRecord)) {
        if (!Object.prototype.hasOwnProperty.call(properties, key)) {
          return false;
        }
      }
    }
  }

  if (Array.isArray(value) && schemaObject.items) {
    return value.every((entry) => validateAgainstSchema(entry, schemaObject.items));
  }

  return true;
}

describe('CLI JSON contract snapshots', () => {
  it('matches committed snapshots for stable automation contracts', { timeout: 20000 }, () => {
    fs.mkdirSync(snapshotDir, { recursive: true });
    const fixtureRepo = createContractFixtureRepo();

    try {
      for (const contract of commandContracts) {
        const snapshotPath = path.join(snapshotDir, contract.file);
        const actualPayload = runCliJsonContract(contract.args, fixtureRepo);
        const actualJson = `${JSON.stringify(actualPayload, null, 2)}\n`;

        const schema = runCliJsonContract(['schema', contract.schemaCommand, '--json'], fixtureRepo);
        expect(
          validateAgainstSchema(actualPayload, schema),
          `Schema validation failed for ${contract.args.join(' ')}`
        ).toBe(true);

        if (shouldUpdateSnapshots || !fs.existsSync(snapshotPath)) {
          fs.writeFileSync(snapshotPath, actualJson, 'utf8');
        }

        const expectedJson = fs.readFileSync(snapshotPath, 'utf8');
        expect(normalizeLineEndings(actualJson)).toBe(normalizeLineEndings(expectedJson));
      }
    } finally {
      fs.rmSync(fixtureRepo, { recursive: true, force: true });
    }
  });
});

describe('contracts command artifact behavior', () => {
  it('supports --json, --out, and --json --out behavior', () => {
    const fixtureRepo = createContractFixtureRepo();

    try {
      const defaultOutPath = path.join(fixtureRepo, '.playbook', 'contracts-registry.json');
      const customOutPath = path.join(fixtureRepo, '.playbook', 'custom-contracts.json');

      const jsonOnly = runCli(['contracts', '--json'], fixtureRepo);
      expect(jsonOnly.status).toBe(0);
      expect(jsonOnly.stdout).toContain('"command": "contracts"');
      expect(fs.existsSync(defaultOutPath)).toBe(false);

      const outOnly = runCli(['contracts', '--out', '.playbook/custom-contracts.json'], fixtureRepo);
      expect(outOnly.status).toBe(0);
      expect(fs.existsSync(customOutPath)).toBe(true);

      const jsonAndOut = runCli(['contracts', '--json', '--out', '.playbook/contracts-registry.json'], fixtureRepo);
      expect(jsonAndOut.status).toBe(0);
      expect(jsonAndOut.stdout).toContain('"command": "contracts"');
      expect(fs.existsSync(defaultOutPath)).toBe(true);
    } finally {
      fs.rmSync(fixtureRepo, { recursive: true, force: true });
    }
  });
});
