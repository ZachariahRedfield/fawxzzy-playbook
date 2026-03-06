import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { queryRepositoryIndex } from '../src/query/repoQuery.js';

const createRepo = (name: string): string => fs.mkdtempSync(path.join(os.tmpdir(), `${name}-`));

const writeRepoIndex = (repo: string, payload: Record<string, unknown>): void => {
  const indexPath = path.join(repo, '.playbook', 'repo-index.json');
  fs.mkdirSync(path.dirname(indexPath), { recursive: true });
  fs.writeFileSync(indexPath, JSON.stringify(payload, null, 2));
};

describe('queryRepositoryIndex', () => {
  it('reads .playbook/repo-index.json and returns requested fields', () => {
    const repo = createRepo('playbook-repo-query');
    writeRepoIndex(repo, {
      schemaVersion: '1.0',
      framework: 'nextjs',
      language: 'typescript',
      architecture: 'modular-monolith',
      modules: ['users', 'workouts'],
      database: 'supabase',
      rules: ['requireNotesOnChanges']
    });

    expect(queryRepositoryIndex(repo, 'architecture')).toEqual({ field: 'architecture', result: 'modular-monolith' });
    expect(queryRepositoryIndex(repo, 'modules')).toEqual({ field: 'modules', result: ['users', 'workouts'] });
  });


  it('normalizes natural language query field requests to supported fields', () => {
    const repo = createRepo('playbook-repo-query-natural-language');
    writeRepoIndex(repo, {
      schemaVersion: '1.0',
      framework: 'node',
      language: 'typescript',
      architecture: 'modular-monolith',
      modules: ['api', 'worker'],
      database: 'none',
      rules: ['notes.missing']
    });

    expect(queryRepositoryIndex(repo, 'list modules')).toEqual({ field: 'modules', result: ['api', 'worker'] });
  });

  it('throws deterministic errors for unsupported fields', () => {
    const repo = createRepo('playbook-repo-query-unsupported-field');
    writeRepoIndex(repo, {
      schemaVersion: '1.0',
      framework: 'node',
      language: 'javascript',
      architecture: 'modular-monolith',
      modules: [],
      database: 'none',
      rules: []
    });

    expect(() => queryRepositoryIndex(repo, 'docs')).toThrow(
      'playbook query: unsupported field "docs". Supported fields: architecture, framework, language, modules, database, rules.'
    );
  });

  it('throws deterministic errors when index file is missing', () => {
    const repo = createRepo('playbook-repo-query-missing-index');

    expect(() => queryRepositoryIndex(repo, 'modules')).toThrow(
      'playbook query: missing repository index at .playbook/repo-index.json. Run "playbook index" first.'
    );
  });

  it('throws deterministic errors for unsupported schema version', () => {
    const repo = createRepo('playbook-repo-query-invalid-schema');
    writeRepoIndex(repo, {
      schemaVersion: '2.0',
      framework: 'node',
      language: 'javascript',
      architecture: 'modular-monolith',
      modules: [],
      database: 'none',
      rules: []
    });

    expect(() => queryRepositoryIndex(repo, 'modules')).toThrow(
      'playbook query: unsupported repository index schemaVersion "2.0". Expected "1.0".'
    );
  });
});
