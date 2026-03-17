import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PLAYBOOK_SCHEMA_PATHS } from '../../packages/contracts/src/index.js';

describe('pr-review contract', () => {
  it('registers pr-review schema path', () => {
    expect(PLAYBOOK_SCHEMA_PATHS.prReview).toBe('packages/contracts/src/pr-review.schema.json');
  });

  it('declares governed summary and policy fields', () => {
    const schemaPath = path.resolve(process.cwd(), PLAYBOOK_SCHEMA_PATHS.prReview);
    const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8')) as {
      required?: string[];
      properties?: {
        kind?: { const?: string };
        summary?: { required?: string[] };
        policy?: { required?: string[] };
      };
    };

    expect(schema.required).toEqual(['schemaVersion', 'kind', 'findings', 'proposals', 'policy', 'summary']);
    expect(schema.properties?.kind?.const).toBe('pr-review');
    expect(schema.properties?.summary?.required).toEqual(['findings', 'proposals', 'safe', 'requires_review', 'blocked']);
    expect(schema.properties?.policy?.required).toEqual(['safe', 'requires_review', 'blocked']);
  });
});
