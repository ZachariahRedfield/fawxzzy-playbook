import {
  buildKnowledgeSummary,
  getKnowledgeById,
  getKnowledgeProvenance,
  getKnowledgeTimeline,
  getStaleKnowledge,
  listKnowledge,
  queryKnowledge,
  type KnowledgeProvenanceResult,
  type KnowledgeQueryOptions,
  type KnowledgeRecord,
  type KnowledgeSummary,
  type KnowledgeTimelineOptions
} from '@zachariahredfield/playbook-core';
import { resolvePatternKnowledgeStore } from '../patternStore.js';

const filterPayload = (options: Partial<KnowledgeQueryOptions>): Record<string, string | number> => {
  const payload: Record<string, string | number> = {};
  if (options.type) payload.type = options.type;
  if (options.status) payload.status = options.status;
  if (options.module) payload.module = options.module;
  if (options.ruleId) payload.ruleId = options.ruleId;
  if (options.text) payload.text = options.text;
  if (typeof options.limit === 'number') payload.limit = options.limit;
  if (options.order) payload.order = options.order;
  if (typeof options.staleDays === 'number') payload.staleDays = options.staleDays;
  return payload;
};

const createListPayload = (
  projectRoot: string,
  command: 'knowledge-list' | 'knowledge-query' | 'knowledge-timeline' | 'knowledge-stale',
  knowledge: KnowledgeRecord[],
  filters: Record<string, string | number>
) => ({
  schemaVersion: '1.0' as const,
  command,
  filters,
  summary: buildKnowledgeSummary(knowledge),
  scope_metadata: {
    pattern_scope: (() => {
      const store = resolvePatternKnowledgeStore('repo_local_memory', { projectRoot });
      return {
        scope: store.scope,
        artifact_path: store.canonicalRelativePath,
        compat_artifact_paths: store.compatibilityRelativePaths
      };
    })()
  },
  knowledge
});

export type KnowledgeListResult = ReturnType<typeof knowledgeList>;
export type KnowledgeQueryResult = ReturnType<typeof knowledgeQuery>;
export type KnowledgeInspectResult = ReturnType<typeof knowledgeInspect>;
export type KnowledgeTimelineResult = ReturnType<typeof knowledgeTimeline>;
export type KnowledgeProvenanceQueryResult = ReturnType<typeof knowledgeProvenance>;
export type KnowledgeStaleResult = ReturnType<typeof knowledgeStale>;

export const knowledgeList = (projectRoot: string, options: KnowledgeQueryOptions = {}) =>
  createListPayload(projectRoot, 'knowledge-list', listKnowledge(projectRoot, options), filterPayload(options));

export const knowledgeQuery = (projectRoot: string, options: KnowledgeQueryOptions = {}) =>
  createListPayload(projectRoot, 'knowledge-query', queryKnowledge(projectRoot, options), filterPayload(options));

export const knowledgeInspect = (projectRoot: string, id: string, options: Pick<KnowledgeQueryOptions, 'staleDays'> = {}) => {
  const knowledge = getKnowledgeById(projectRoot, id, options);
  if (!knowledge) {
    throw new Error(`playbook knowledge inspect: record not found: ${id}`);
  }

  return {
    schemaVersion: '1.0' as const,
    command: 'knowledge-inspect' as const,
    id,
    knowledge
  };
};

export const knowledgeTimeline = (projectRoot: string, options: KnowledgeTimelineOptions = {}) =>
  createListPayload(projectRoot, 'knowledge-timeline', getKnowledgeTimeline(projectRoot, options), filterPayload(options));

export const knowledgeProvenance = (
  projectRoot: string,
  id: string,
  options: Pick<KnowledgeQueryOptions, 'staleDays'> = {}
) => {
  const provenance = getKnowledgeProvenance(projectRoot, id, options);
  if (!provenance) {
    throw new Error(`playbook knowledge provenance: record not found: ${id}`);
  }

  return {
    schemaVersion: '1.0' as const,
    command: 'knowledge-provenance' as const,
    id,
    provenance
  };
};

export const knowledgeStale = (
  projectRoot: string,
  options: Pick<KnowledgeQueryOptions, 'limit' | 'order' | 'staleDays'> = {}
) => createListPayload(projectRoot, 'knowledge-stale', getStaleKnowledge(projectRoot, options), filterPayload(options));

export type { KnowledgeRecord, KnowledgeQueryOptions, KnowledgeTimelineOptions, KnowledgeSummary, KnowledgeProvenanceResult };
