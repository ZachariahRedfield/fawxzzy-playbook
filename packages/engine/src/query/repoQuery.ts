import fs from 'node:fs';
import path from 'node:path';
import type { RepositoryIndex } from '../indexer/repoIndexer.js';

export const SUPPORTED_QUERY_FIELDS = ['architecture', 'framework', 'language', 'modules', 'database', 'rules'] as const;

export type RepositoryQueryField = (typeof SUPPORTED_QUERY_FIELDS)[number];

export type RepositoryQueryResult = {
  field: RepositoryQueryField;
  result: RepositoryIndex[RepositoryQueryField];
};

const INDEX_RELATIVE_PATH = '.playbook/repo-index.json' as const;
const SUPPORTED_FIELDS_MESSAGE = SUPPORTED_QUERY_FIELDS.join(', ');

const isRepositoryQueryField = (field: string): field is RepositoryQueryField =>
  SUPPORTED_QUERY_FIELDS.includes(field as RepositoryQueryField);

const readRepositoryIndex = (projectRoot: string): RepositoryIndex => {
  const indexPath = path.join(projectRoot, INDEX_RELATIVE_PATH);
  if (!fs.existsSync(indexPath)) {
    throw new Error('playbook query: missing repository index at .playbook/repo-index.json. Run "playbook index" first.');
  }

  const raw = fs.readFileSync(indexPath, 'utf8');
  const parsed = JSON.parse(raw) as Partial<RepositoryIndex>;

  if (parsed.schemaVersion !== '1.0') {
    throw new Error(
      `playbook query: unsupported repository index schemaVersion "${String(parsed.schemaVersion)}". Expected "1.0".`
    );
  }

  return parsed as RepositoryIndex;
};

export const queryRepositoryIndex = (projectRoot: string, field: string): RepositoryQueryResult => {
  if (!isRepositoryQueryField(field)) {
    throw new Error(`playbook query: unsupported field "${field}". Supported fields: ${SUPPORTED_FIELDS_MESSAGE}.`);
  }

  const index = readRepositoryIndex(projectRoot);

  return {
    field,
    result: index[field]
  };
};
