import fs from 'node:fs';
import path from 'node:path';
import type { RepositoryIndex } from '../indexer/repoIndexer.js';

export type ModuleOwnershipEntry = {
  name: string;
  owners: string[];
  area: string;
};

export type ModuleOwnersQueryResult =
  | {
      schemaVersion: '1.0';
      command: 'query';
      type: 'module-owners';
      modules: ModuleOwnershipEntry[];
    }
  | {
      schemaVersion: '1.0';
      command: 'query';
      type: 'module-owners';
      module: ModuleOwnershipEntry;
    };

type ModuleOwnersMapping = Record<string, { owners?: unknown; area?: unknown }>;

const INDEX_RELATIVE_PATH = '.playbook/repo-index.json' as const;
const OWNERS_RELATIVE_PATH = '.playbook/module-owners.json' as const;
const DEFAULT_AREA = 'unassigned' as const;

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

const readModuleOwnersMapping = (projectRoot: string): ModuleOwnersMapping => {
  const ownersPath = path.join(projectRoot, OWNERS_RELATIVE_PATH);
  if (!fs.existsSync(ownersPath)) {
    return {};
  }

  const raw = fs.readFileSync(ownersPath, 'utf8');
  const parsed = JSON.parse(raw) as unknown;

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('playbook query module-owners: invalid ownership mapping at .playbook/module-owners.json. Expected an object keyed by module name.');
  }

  return parsed as ModuleOwnersMapping;
};

const sanitizeOwners = (owners: unknown): string[] => {
  if (!Array.isArray(owners)) {
    return [];
  }

  return owners
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
};

const sanitizeArea = (area: unknown): string => {
  if (typeof area !== 'string') {
    return DEFAULT_AREA;
  }

  const trimmed = area.trim();
  return trimmed.length > 0 ? trimmed : DEFAULT_AREA;
};

const toOwnershipEntry = (moduleName: string, mapping: ModuleOwnersMapping): ModuleOwnershipEntry => {
  const mapped = mapping[moduleName];

  return {
    name: moduleName,
    owners: sanitizeOwners(mapped?.owners),
    area: sanitizeArea(mapped?.area)
  };
};

export const queryModuleOwners = (projectRoot: string, moduleName?: string): ModuleOwnersQueryResult => {
  const index = readRepositoryIndex(projectRoot);
  const mapping = readModuleOwnersMapping(projectRoot);

  if (moduleName) {
    if (!index.modules.some((moduleEntry) => moduleEntry.name === moduleName)) {
      throw new Error(`playbook query module-owners: unknown module "${moduleName}".`);
    }

    return {
      schemaVersion: '1.0',
      command: 'query',
      type: 'module-owners',
      module: toOwnershipEntry(moduleName, mapping)
    };
  }

  return {
    schemaVersion: '1.0',
    command: 'query',
    type: 'module-owners',
    modules: index.modules
      .map((moduleEntry) => moduleEntry.name)
      .sort((a, b) => a.localeCompare(b))
      .map((name) => toOwnershipEntry(name, mapping))
  };
};
