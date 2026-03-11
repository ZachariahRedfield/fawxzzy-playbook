import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  applySafePlaybookIgnoreRecommendations,
  suggestPlaybookIgnore
} from '../src/index.js';

const createRepo = (): string => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'playbook-ignore-'));
  fs.mkdirSync(path.join(repo, '.playbook', 'runtime', 'current'), { recursive: true });
  return repo;
};

const writeRecommendations = (repo: string): void => {
  fs.writeFileSync(
    path.join(repo, '.playbook', 'runtime', 'current', 'ignore-recommendations.json'),
    JSON.stringify(
      {
        schemaVersion: '1.0',
        cycle_id: 'cycle-1',
        generated_at: '2026-03-11T00:00:00.000Z',
        recommendation_model: 'deterministic-v1',
        ranking_factors: ['rank'],
        recommendations: [
          {
            path: '.git/',
            rank: 1,
            class: 'vcs-internal',
            rationale: 'safe',
            confidence: 0.99,
            expected_scan_impact: { estimated_files_reduced: 1, estimated_bytes_reduced: 1, impact_level: 'low' },
            safety_level: 'safe-default'
          },
          {
            path: 'node_modules/',
            rank: 2,
            class: 'build-cache',
            rationale: 'safe',
            confidence: 0.99,
            expected_scan_impact: { estimated_files_reduced: 10, estimated_bytes_reduced: 10, impact_level: 'medium' },
            safety_level: 'safe-default'
          },
          {
            path: 'tmp_file.txt',
            rank: 3,
            class: 'temporary-file',
            rationale: 'review',
            confidence: 0.61,
            expected_scan_impact: { estimated_files_reduced: 1, estimated_bytes_reduced: 1, impact_level: 'low' },
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
            'build-cache': 1,
            'generated-report': 0,
            'temporary-file': 1,
            'binary-asset': 0,
            unknown: 0
          }
        }
      },
      null,
      2
    ),
    'utf8'
  );
};

describe('playbook ignore workflow', () => {
  it('reports recommendation coverage from .playbookignore', () => {
    const repo = createRepo();
    writeRecommendations(repo);
    fs.writeFileSync(path.join(repo, '.playbookignore'), 'node_modules/\n', 'utf8');

    const result = suggestPlaybookIgnore(repo);

    expect(result.recommendations.find((entry) => entry.path === 'node_modules/')?.already_covered).toBe(true);
    expect(result.recommendations.find((entry) => entry.path === '.git/')?.already_covered).toBe(false);
    expect(result.review_required.map((entry) => entry.path)).toContain('tmp_file.txt');
  });

  it('creates a managed block with only missing safe-default entries and remains idempotent', () => {
    const repo = createRepo();
    writeRecommendations(repo);
    fs.writeFileSync(path.join(repo, '.playbookignore'), 'coverage/\nnode_modules/\n', 'utf8');

    const first = applySafePlaybookIgnoreRecommendations(repo);
    const firstContent = fs.readFileSync(path.join(repo, '.playbookignore'), 'utf8');
    const second = applySafePlaybookIgnoreRecommendations(repo);
    const secondContent = fs.readFileSync(path.join(repo, '.playbookignore'), 'utf8');

    expect(first.changed).toBe(true);
    expect(first.applied_entries).toEqual(['.git/']);
    expect(first.already_covered_entries).toEqual(['node_modules/']);
    expect(first.deferred_entries).toEqual(['tmp_file.txt']);
    expect(firstContent).toContain('# PLAYBOOK:IGNORE_START');
    expect(firstContent).toContain('.git/');
    expect(firstContent).not.toContain('tmp_file.txt');
    expect(second.changed).toBe(false);
    expect(secondContent).toBe(firstContent);
  });

  it('retains previously managed safe-default entries when later suggestions disappear', () => {
    const repo = createRepo();
    writeRecommendations(repo);

    const first = applySafePlaybookIgnoreRecommendations(repo);
    expect(first.changed).toBe(true);

    fs.writeFileSync(
      path.join(repo, '.playbook', 'runtime', 'current', 'ignore-recommendations.json'),
      JSON.stringify(
        {
          schemaVersion: '1.0',
          cycle_id: 'cycle-2',
          generated_at: '2026-03-11T00:00:01.000Z',
          recommendation_model: 'deterministic-v1',
          ranking_factors: ['rank'],
          recommendations: [],
          summary: {
            total_recommendations: 0,
            safety_level_counts: { 'safe-default': 0, 'likely-safe': 0, 'review-first': 0 },
            class_counts: {
              'vcs-internal': 0,
              'build-cache': 0,
              'generated-report': 0,
              'temporary-file': 0,
              'binary-asset': 0,
              unknown: 0
            }
          }
        },
        null,
        2
      ),
      'utf8'
    );

    const second = applySafePlaybookIgnoreRecommendations(repo);
    const content = fs.readFileSync(path.join(repo, '.playbookignore'), 'utf8');

    expect(second.changed).toBe(false);
    expect(content).toContain('# PLAYBOOK:IGNORE_START');
    expect(content).toContain('.git/');
    expect(content).toContain('node_modules/');
  });
});
