import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(import.meta.dirname, '../../..');

describe('worker assignments artifact contract', () => {
  it('defines required worker assignment artifact and lane entry fields', () => {
    const schema = JSON.parse(fs.readFileSync(path.join(repoRoot, 'packages/contracts/src/worker-assignments.schema.json'), 'utf8')) as {
      required: string[];
      properties: Record<string, unknown>;
      $defs: {
        laneAssignment: { required: string[]; properties: Record<string, unknown> };
      };
    };

    expect(schema.required).toEqual(
      expect.arrayContaining(['schemaVersion', 'kind', 'proposalOnly', 'generatedAt', 'lanes', 'readiness_summary', 'workers', 'warnings'])
    );
    expect(schema.$defs.laneAssignment.required).toEqual(
      expect.arrayContaining([
        'lane_id',
        'worker_type',
        'status',
        'readiness_status',
        'task_ids',
        'assigned_prompt',
        'dependencies_satisfied',
        'blocking_reasons',
        'conflict_surface_paths',
        'shared_artifact_risk',
        'assignment_confidence'
      ])
    );

    expect(schema.properties.kind).toEqual({ type: 'string', const: 'worker-assignments' });
  });
});
