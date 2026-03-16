import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { describe, expect, it } from 'vitest';
import {
  createPatternPortabilityContract,
  validatePatternPortabilityContract,
  writeCrossRepoPatternEvidenceArtifact
} from './patternPortabilityContract.js';

describe('pattern portability contract', () => {
  it('defines required contract schema fields', () => {
    const schemaPath = path.join(process.cwd(), '..', 'contracts', 'src', 'pattern-portability.schema.json');
    const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8')) as {
      required: string[];
      properties: Record<string, unknown>;
      $defs: {
        patternPortabilityEntry: {
          required: string[];
        };
      };
    };

    expect(schema.required).toEqual(expect.arrayContaining(['schemaVersion', 'kind', 'generatedAt', 'patterns']));
    expect(schema.properties.kind).toEqual({ type: 'string', const: 'pattern-portability' });
    expect(schema.$defs.patternPortabilityEntry.required).toEqual(
      expect.arrayContaining([
        'pattern_id',
        'source_repo',
        'evidence_runs',
        'portability_score',
        'confidence_score',
        'supporting_artifacts',
        'related_subsystems'
      ])
    );
  });

  it('generates deterministic cross-repo evidence artifact', () => {
    const contract = createPatternPortabilityContract({
      sourceRepo: 'acme/payments',
      generatedAt: '2026-02-10T00:00:00.000Z',
      patterns: [
        {
          patternId: 'pattern.contract-bootstrap',
          portabilityScore: 0.74,
          confidenceScore: 0.7,
          evidenceRuns: 5,
          supportingArtifacts: ['.playbook/memory/events/runtime/r1.json'],
          relatedSubsystems: ['bootstrap_contract_surface', 'knowledge_lifecycle']
        }
      ]
    });

    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'playbook-portability-'));
    const artifactPath = writeCrossRepoPatternEvidenceArtifact(tempRoot, contract);
    const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8')) as {
      kind: string;
      patterns: Array<{
        pattern_id: string;
        source_repo: string;
        portability_score: number;
        evidence_summary: {
          evidence_runs: number;
        };
      }>;
    };

    expect(artifact.kind).toBe('cross-repo-patterns');
    expect(artifact.patterns).toHaveLength(1);
    expect(artifact.patterns[0]).toEqual(
      expect.objectContaining({
        pattern_id: 'pattern.contract-bootstrap',
        source_repo: 'acme/payments',
        portability_score: 0.74,
        evidence_summary: expect.objectContaining({ evidence_runs: 5 })
      })
    );
  });

  it('detects invalid contract payloads', () => {
    const invalidContract = {
      schemaVersion: '1.0',
      kind: 'pattern-portability',
      generatedAt: '2026-02-10T00:00:00.000Z',
      patterns: [
        {
          pattern_id: 'pattern.bad',
          source_repo: 'acme/payments',
          evidence_runs: 0,
          portability_score: 1.2,
          confidence_score: -0.1,
          supporting_artifacts: [],
          related_subsystems: []
        }
      ]
    };

    expect(validatePatternPortabilityContract(invalidContract)).toBe(false);
  });
});
