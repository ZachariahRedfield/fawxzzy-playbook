import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  MEMORY_PRESSURE_STATUS_LEGACY_RELATIVE_PATH,
  MEMORY_PRESSURE_STATUS_RELATIVE_PATH,
  buildMemoryPressureStatusArtifact,
  resolveMemoryPressureBand,
  writeMemoryPressureStatusArtifact
} from './pressurePolicy.js';
import { defaultConfig } from '../config/schema.js';

const makeRepo = (): string => fs.mkdtempSync(path.join(os.tmpdir(), 'playbook-memory-pressure-'));

const writeJson = (repoRoot: string, relativePath: string, payload: unknown): void => {
  const filePath = path.join(repoRoot, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
};

describe('memory pressure policy', () => {
  it('produces deterministic band/state for the same inputs', () => {
    const repoRoot = makeRepo();
    writeJson(repoRoot, '.playbook/memory/index.json', { events: [{ eventId: 'evt-1' }, { eventId: 'evt-2' }] });
    writeJson(repoRoot, '.playbook/memory/events/evt-1.json', { kind: 'memory-event' });
    writeJson(repoRoot, '.playbook/memory/events/evt-2.json', { kind: 'memory-event' });
    writeJson(repoRoot, '.playbook/memory/knowledge/decisions.json', { entries: [] });

    const policy = {
      ...defaultConfig.memory.pressurePolicy,
      budgetBytes: 100,
      budgetFiles: 3,
      budgetEvents: 3
    };

    const first = buildMemoryPressureStatusArtifact({ repoRoot, policy, previousBand: 'warm' });
    const second = buildMemoryPressureStatusArtifact({ repoRoot, policy, previousBand: 'warm' });
    expect(second).toEqual(first);
  });

  it('applies hysteresis to prevent band thrash', () => {
    const policy = {
      ...defaultConfig.memory.pressurePolicy,
      watermarks: {
        warm: 0.65,
        pressure: 0.85,
        critical: 1
      },
      hysteresis: 0.05
    };

    expect(resolveMemoryPressureBand({ score: 0.86, previousBand: 'warm', policy })).toBe('pressure');
    expect(resolveMemoryPressureBand({ score: 0.83, previousBand: 'pressure', policy })).toBe('pressure');
    expect(resolveMemoryPressureBand({ score: 0.79, previousBand: 'pressure', policy })).toBe('warm');
  });

  it('never selects canonical artifacts for eviction', () => {
    const repoRoot = makeRepo();
    writeJson(repoRoot, '.playbook/memory/index.json', { events: [{ eventId: 'evt-1' }] });
    writeJson(repoRoot, '.playbook/memory/events/evt-1.json', { kind: 'memory-event' });
    writeJson(repoRoot, '.playbook/memory/knowledge/decisions.json', { entries: [] });
    writeJson(repoRoot, '.playbook/memory/knowledge/patterns.json', { entries: [] });
    writeJson(repoRoot, '.playbook/memory/knowledge/failure-modes.json', { entries: [] });
    writeJson(repoRoot, '.playbook/memory/knowledge/invariants.json', { entries: [] });

    const policy = {
      ...defaultConfig.memory.pressurePolicy,
      budgetBytes: 10,
      budgetFiles: 1,
      budgetEvents: 1
    };

    const artifact = buildMemoryPressureStatusArtifact({ repoRoot, policy, previousBand: 'critical' });
    expect(artifact.band).toBe('critical');
    expect(artifact.invariants.canonicalEvictionCandidates).toEqual([]);
    expect(artifact.invariants.disposableEvictionCandidates.some((entry) => entry.includes('/knowledge/'))).toBe(false);
  });

  it('requires summarize/compact actions before disposable eviction at critical band', () => {
    const repoRoot = makeRepo();
    writeJson(repoRoot, '.playbook/memory/index.json', { events: [{ eventId: 'evt-critical' }] });
    writeJson(repoRoot, '.playbook/memory/events/evt-critical.json', {
      kind: 'memory-event',
      summary: 'force critical-band pressure input'
    });

    const actions = buildMemoryPressureStatusArtifact({
      repoRoot,
      policy: {
        ...defaultConfig.memory.pressurePolicy,
        budgetBytes: 1,
        budgetFiles: 1,
        budgetEvents: 1
      },
      previousBand: 'critical'
    }).recommendedActions;

    expect(actions).toContain('evict-disposable-after-summary');
    expect(actions.indexOf('summarize-runtime-events-into-rollups')).toBeLessThan(actions.indexOf('evict-disposable-after-summary'));
    expect(actions.indexOf('aggressive-compaction')).toBeLessThan(actions.indexOf('evict-disposable-after-summary'));
  });

  it('writes canonical and compatibility memory pressure artifacts', () => {
    const repoRoot = makeRepo();
    const artifact = buildMemoryPressureStatusArtifact({
      repoRoot,
      policy: defaultConfig.memory.pressurePolicy,
      previousBand: 'normal'
    });

    writeMemoryPressureStatusArtifact(repoRoot, artifact);

    const canonicalPath = path.join(repoRoot, MEMORY_PRESSURE_STATUS_RELATIVE_PATH);
    const legacyPath = path.join(repoRoot, MEMORY_PRESSURE_STATUS_LEGACY_RELATIVE_PATH);
    expect(fs.existsSync(canonicalPath)).toBe(true);
    expect(fs.existsSync(legacyPath)).toBe(true);
    expect(fs.readFileSync(canonicalPath, 'utf8')).toBe(fs.readFileSync(legacyPath, 'utf8'));
  });
});
