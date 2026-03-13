import fs from 'node:fs';
import path from 'node:path';
import type {
  KnowledgeArtifactType,
  KnowledgeProvenanceResult,
  KnowledgeQueryOptions,
  KnowledgeRecord,
  KnowledgeSummary,
  KnowledgeTimelineOptions
} from './types.js';

const MEMORY_ROOT = '.playbook/memory' as const;
const MEMORY_EVENTS_DIR = `${MEMORY_ROOT}/events` as const;
const MEMORY_CANDIDATES_PATH = `${MEMORY_ROOT}/candidates.json` as const;
const KNOWLEDGE_PATHS = [
  `${MEMORY_ROOT}/knowledge/decisions.json`,
  `${MEMORY_ROOT}/knowledge/patterns.json`,
  `${MEMORY_ROOT}/knowledge/failure-modes.json`,
  `${MEMORY_ROOT}/knowledge/invariants.json`
] as const;
const DEFAULT_STALE_DAYS = 45;
const EPOCH_ISO = new Date(0).toISOString();

type MemoryEventArtifact = {
  kind?: unknown;
  eventInstanceId?: unknown;
  eventFingerprint?: unknown;
  createdAt?: unknown;
  repoRevision?: unknown;
  sources?: unknown;
  subjectModules?: unknown;
  ruleIds?: unknown;
  riskSummary?: unknown;
  outcome?: unknown;
  salienceInputs?: unknown;
};

type MemoryCandidateProvenance = {
  eventId?: unknown;
  sourcePath?: unknown;
  fingerprint?: unknown;
  runId?: unknown;
};

type MemoryCandidateArtifact = {
  command?: unknown;
  generatedAt?: unknown;
  candidates?: unknown;
};

type MemoryCandidateEntry = {
  candidateId?: unknown;
  kind?: unknown;
  title?: unknown;
  summary?: unknown;
  clusterKey?: unknown;
  salienceScore?: unknown;
  salienceFactors?: unknown;
  fingerprint?: unknown;
  module?: unknown;
  ruleId?: unknown;
  failureShape?: unknown;
  eventCount?: unknown;
  provenance?: unknown;
  lastSeenAt?: unknown;
  supersession?: unknown;
};

type MemoryKnowledgeArtifact = {
  kind?: unknown;
  generatedAt?: unknown;
  entries?: unknown;
};

type MemoryKnowledgeEntry = {
  knowledgeId?: unknown;
  candidateId?: unknown;
  sourceCandidateIds?: unknown;
  sourceEventFingerprints?: unknown;
  kind?: unknown;
  title?: unknown;
  summary?: unknown;
  fingerprint?: unknown;
  module?: unknown;
  ruleId?: unknown;
  failureShape?: unknown;
  promotedAt?: unknown;
  provenance?: unknown;
  status?: unknown;
  supersedes?: unknown;
  supersededBy?: unknown;
  retiredAt?: unknown;
  retirementReason?: unknown;
};

const safeReadJson = <T>(filePath: string): T | null => {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
};

const toRelativePath = (projectRoot: string, filePath: string): string =>
  path.relative(projectRoot, filePath).replaceAll('\\', '/');

const listJsonFiles = (dirPath: string): string[] => {
  if (!fs.existsSync(dirPath)) {
    return [];
  }

  return fs.readdirSync(dirPath, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      return listJsonFiles(fullPath);
    }
    return entry.isFile() && entry.name.endsWith('.json') ? [fullPath] : [];
  });
};

const toStringArray = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    : [];

const toIsoDate = (value: unknown, fallback: string = EPOCH_ISO): string => {
  if (typeof value !== 'string') {
    return fallback;
  }

  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? fallback : new Date(parsed).toISOString();
};

const toNumberOrNull = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

const resolveRepoName = (projectRoot: string): string => {
  const packageJson = safeReadJson<{ name?: unknown }>(path.join(projectRoot, 'package.json'));
  if (typeof packageJson?.name === 'string' && packageJson.name.trim().length > 0) {
    return packageJson.name;
  }

  return path.basename(projectRoot);
};

const staleCutoffMs = (staleDays: number): number => Date.now() - staleDays * 24 * 60 * 60 * 1000;

const isStaleCandidate = (lastSeenAt: unknown, staleDays: number): boolean => {
  if (typeof lastSeenAt !== 'string') {
    return false;
  }

  const parsed = Date.parse(lastSeenAt);
  return !Number.isNaN(parsed) && parsed < staleCutoffMs(staleDays);
};

const sortRecords = (records: KnowledgeRecord[], order: 'asc' | 'desc'): KnowledgeRecord[] => {
  const sorted = [...records].sort((left, right) => {
    const createdDelta = Date.parse(left.createdAt) - Date.parse(right.createdAt);
    if (createdDelta !== 0) {
      return createdDelta;
    }

    const leftKey = [
      left.type,
      left.status,
      left.source.command ?? '',
      left.source.kind,
      typeof left.metadata.module === 'string' ? left.metadata.module : '',
      typeof left.metadata.ruleId === 'string' ? left.metadata.ruleId : '',
      typeof left.metadata.title === 'string' ? left.metadata.title : '',
      typeof left.metadata.kind === 'string' ? left.metadata.kind : '',
      JSON.stringify(left.metadata.eventFingerprint ?? null),
      left.id
    ].join('\u0000');
    const rightKey = [
      right.type,
      right.status,
      right.source.command ?? '',
      right.source.kind,
      typeof right.metadata.module === 'string' ? right.metadata.module : '',
      typeof right.metadata.ruleId === 'string' ? right.metadata.ruleId : '',
      typeof right.metadata.title === 'string' ? right.metadata.title : '',
      typeof right.metadata.kind === 'string' ? right.metadata.kind : '',
      JSON.stringify(right.metadata.eventFingerprint ?? null),
      right.id
    ].join('\u0000');

    return leftKey.localeCompare(rightKey);
  });

  return order === 'desc' ? sorted.reverse() : sorted;
};

const normalizeConfidence = (value: unknown): number | null => {
  const score = toNumberOrNull(value);
  if (score === null) {
    return null;
  }

  return Math.max(0, Math.min(1, score / 10));
};

const readEvidenceRecords = (projectRoot: string, repo: string): KnowledgeRecord[] =>
  listJsonFiles(path.join(projectRoot, MEMORY_EVENTS_DIR))
    .flatMap((filePath) => {
      const parsed = safeReadJson<MemoryEventArtifact>(filePath);
      if (!parsed || typeof parsed.eventInstanceId !== 'string') {
        return [];
      }

      const relativePath = toRelativePath(projectRoot, filePath);
      const fingerprint = typeof parsed.eventFingerprint === 'string' ? parsed.eventFingerprint : '';

      return [{
        id: parsed.eventInstanceId,
        type: 'evidence' as const,
        createdAt: toIsoDate(parsed.createdAt),
        repo,
        source: {
          kind: 'memory-event' as const,
          path: relativePath,
          command: typeof parsed.kind === 'string' ? parsed.kind : null
        },
        confidence: null,
        status: 'observed' as const,
        provenance: {
          repo,
          sourceCommand: typeof parsed.kind === 'string' ? parsed.kind : null,
          runId: null,
          sourcePath: relativePath,
          eventIds: [parsed.eventInstanceId],
          evidenceIds: [parsed.eventInstanceId],
          fingerprints: fingerprint ? [fingerprint] : [],
          relatedRecordIds: []
        },
        metadata: {
          kind: parsed.kind ?? null,
          eventFingerprint: parsed.eventFingerprint ?? null,
          repoRevision: parsed.repoRevision ?? null,
          subjectModules: toStringArray(parsed.subjectModules),
          ruleIds: toStringArray(parsed.ruleIds),
          riskSummary: parsed.riskSummary ?? null,
          outcome: parsed.outcome ?? null,
          salienceInputs: parsed.salienceInputs ?? null,
          sources: Array.isArray(parsed.sources) ? parsed.sources : []
        }
      } satisfies KnowledgeRecord];
    });

const readCandidateRecords = (projectRoot: string, repo: string, staleDays: number): KnowledgeRecord[] => {
  const artifactPath = path.join(projectRoot, MEMORY_CANDIDATES_PATH);
  const parsed = safeReadJson<MemoryCandidateArtifact>(artifactPath);
  if (!parsed || !Array.isArray(parsed.candidates)) {
    return [];
  }

  return parsed.candidates
    .flatMap((candidate) => {
      const entry = candidate as MemoryCandidateEntry;
      if (typeof entry.candidateId !== 'string') {
        return [];
      }

      const provenanceEntries = Array.isArray(entry.provenance)
        ? entry.provenance as MemoryCandidateProvenance[]
        : [];
      const eventIds = provenanceEntries
        .map((item) => (typeof item.eventId === 'string' ? item.eventId : null))
        .filter((value): value is string => value !== null);
      const sourcePaths = provenanceEntries
        .map((item) => (typeof item.sourcePath === 'string' ? item.sourcePath : null))
        .filter((value): value is string => value !== null);
      const fingerprints = provenanceEntries
        .map((item) => (typeof item.fingerprint === 'string' ? item.fingerprint : null))
        .filter((value): value is string => value !== null);
      const runId = provenanceEntries.find((item) => typeof item.runId === 'string')?.runId as string | undefined;
      const relativePath = toRelativePath(projectRoot, artifactPath);

      return [{
        id: entry.candidateId,
        type: 'candidate' as const,
        createdAt: toIsoDate(entry.lastSeenAt, toIsoDate(parsed.generatedAt)),
        repo,
        source: {
          kind: 'memory-candidate' as const,
          path: relativePath,
          command: typeof parsed.command === 'string' ? parsed.command : null
        },
        confidence: normalizeConfidence(entry.salienceScore),
        status: isStaleCandidate(entry.lastSeenAt, staleDays) ? 'stale' : 'active',
        provenance: {
          repo,
          sourceCommand: typeof parsed.command === 'string' ? parsed.command : null,
          runId: runId ?? null,
          sourcePath: sourcePaths[0] ?? relativePath,
          eventIds,
          evidenceIds: [...eventIds],
          fingerprints,
          relatedRecordIds: []
        },
        metadata: {
          kind: entry.kind ?? null,
          title: entry.title ?? null,
          summary: entry.summary ?? null,
          clusterKey: entry.clusterKey ?? null,
          salienceScore: entry.salienceScore ?? null,
          salienceFactors: entry.salienceFactors ?? null,
          fingerprint: entry.fingerprint ?? null,
          module: entry.module ?? null,
          ruleId: entry.ruleId ?? null,
          failureShape: entry.failureShape ?? null,
          eventCount: entry.eventCount ?? null,
          lastSeenAt: typeof entry.lastSeenAt === 'string' ? toIsoDate(entry.lastSeenAt) : null,
          supersession: entry.supersession ?? null
        }
      } satisfies KnowledgeRecord];
    });
};

const readPromotedRecords = (projectRoot: string, repo: string): KnowledgeRecord[] =>
  KNOWLEDGE_PATHS.flatMap((relativePath) => {
    const parsed = safeReadJson<MemoryKnowledgeArtifact>(path.join(projectRoot, relativePath));
    if (!parsed || !Array.isArray(parsed.entries)) {
      return [];
    }

    return parsed.entries
      .flatMap((value) => {
        const entry = value as MemoryKnowledgeEntry;
        if (typeof entry.knowledgeId !== 'string') {
          return [];
        }

        const provenanceEntries = Array.isArray(entry.provenance)
          ? entry.provenance as MemoryCandidateProvenance[]
          : [];
        const eventIds = provenanceEntries
          .map((item) => (typeof item.eventId === 'string' ? item.eventId : null))
          .filter((item): item is string => item !== null);
        const sourcePaths = provenanceEntries
          .map((item) => (typeof item.sourcePath === 'string' ? item.sourcePath : null))
          .filter((item): item is string => item !== null);
        const provenanceFingerprints = provenanceEntries
          .map((item) => (typeof item.fingerprint === 'string' ? item.fingerprint : null))
          .filter((item): item is string => item !== null);
        const supersedes = toStringArray(entry.supersedes);
        const supersededBy = toStringArray(entry.supersededBy);
        const status =
          entry.status === 'retired'
            ? 'retired'
            : entry.status === 'superseded' || supersededBy.length > 0
              ? 'superseded'
              : 'active';
        const relatedRecordIds = [
          ...toStringArray(entry.sourceCandidateIds),
          ...supersedes,
          ...supersededBy,
          ...(typeof entry.candidateId === 'string' ? [entry.candidateId] : [])
        ];

        return [{
          id: entry.knowledgeId,
          type: status === 'superseded' ? 'superseded' as KnowledgeArtifactType : 'promoted' as KnowledgeArtifactType,
          createdAt: toIsoDate(entry.promotedAt, toIsoDate(parsed.generatedAt)),
          repo,
          source: {
            kind: 'memory-knowledge' as const,
            path: relativePath,
            command: null
          },
          confidence: null,
          status,
          provenance: {
            repo,
            sourceCommand: null,
            runId: (provenanceEntries.find((item) => typeof item.runId === 'string')?.runId as string | undefined) ?? null,
            sourcePath: sourcePaths[0] ?? relativePath,
            eventIds,
            evidenceIds: [...eventIds],
            fingerprints: [...new Set([...provenanceFingerprints, ...toStringArray(entry.sourceEventFingerprints)])]
              .sort((left, right) => left.localeCompare(right)),
            relatedRecordIds: [...new Set(relatedRecordIds)].sort((left, right) => left.localeCompare(right))
          },
          metadata: {
            kind: entry.kind ?? parsed.kind ?? null,
            candidateId: entry.candidateId ?? null,
            title: entry.title ?? null,
            summary: entry.summary ?? null,
            fingerprint: entry.fingerprint ?? null,
            module: entry.module ?? null,
            ruleId: entry.ruleId ?? null,
            failureShape: entry.failureShape ?? null,
            sourceCandidateIds: toStringArray(entry.sourceCandidateIds),
            sourceEventFingerprints: toStringArray(entry.sourceEventFingerprints),
            supersedes,
            supersededBy,
            retiredAt: typeof entry.retiredAt === 'string' ? toIsoDate(entry.retiredAt) : null,
            retirementReason: entry.retirementReason ?? null
          }
        } satisfies KnowledgeRecord];
      });
  });

const hasModuleMatch = (record: KnowledgeRecord, moduleName: string): boolean => {
  if (typeof record.metadata.module === 'string' && record.metadata.module === moduleName) {
    return true;
  }

  return Array.isArray(record.metadata.subjectModules)
    && record.metadata.subjectModules.some((entry) => entry === moduleName);
};

const hasRuleMatch = (record: KnowledgeRecord, ruleId: string): boolean => {
  if (typeof record.metadata.ruleId === 'string' && record.metadata.ruleId === ruleId) {
    return true;
  }

  return Array.isArray(record.metadata.ruleIds)
    && record.metadata.ruleIds.some((entry) => entry === ruleId);
};

const matchesText = (record: KnowledgeRecord, query: string): boolean =>
  JSON.stringify(record).toLowerCase().includes(query.toLowerCase());

const collectKnowledgeRecords = (projectRoot: string, staleDays: number): KnowledgeRecord[] => {
  const repo = resolveRepoName(projectRoot);
  return [
    ...readEvidenceRecords(projectRoot, repo),
    ...readCandidateRecords(projectRoot, repo, staleDays),
    ...readPromotedRecords(projectRoot, repo)
  ];
};

const applyKnowledgeFilters = (records: KnowledgeRecord[], options: KnowledgeQueryOptions = {}): KnowledgeRecord[] => {
  const filtered = records
    .filter((record) => (options.type ? record.type === options.type : true))
    .filter((record) => (options.status ? record.status === options.status : true))
    .filter((record) => (options.module ? hasModuleMatch(record, options.module) : true))
    .filter((record) => (options.ruleId ? hasRuleMatch(record, options.ruleId) : true))
    .filter((record) => (options.text ? matchesText(record, options.text) : true));

  const ordered = sortRecords(filtered, options.order ?? 'desc');
  return typeof options.limit === 'number' && options.limit >= 0 ? ordered.slice(0, options.limit) : ordered;
};

export const buildKnowledgeSummary = (records: KnowledgeRecord[]): KnowledgeSummary => ({
  total: records.length,
  byType: {
    evidence: records.filter((record) => record.type === 'evidence').length,
    candidate: records.filter((record) => record.type === 'candidate').length,
    promoted: records.filter((record) => record.type === 'promoted').length,
    superseded: records.filter((record) => record.type === 'superseded').length
  },
  byStatus: {
    observed: records.filter((record) => record.status === 'observed').length,
    active: records.filter((record) => record.status === 'active').length,
    stale: records.filter((record) => record.status === 'stale').length,
    retired: records.filter((record) => record.status === 'retired').length,
    superseded: records.filter((record) => record.status === 'superseded').length
  }
});

export const listKnowledge = (projectRoot: string, options: KnowledgeQueryOptions = {}): KnowledgeRecord[] =>
  applyKnowledgeFilters(collectKnowledgeRecords(projectRoot, options.staleDays ?? DEFAULT_STALE_DAYS), options);

export const queryKnowledge = (projectRoot: string, options: KnowledgeQueryOptions = {}): KnowledgeRecord[] =>
  listKnowledge(projectRoot, options);

export const getKnowledgeById = (
  projectRoot: string,
  id: string,
  options: Pick<KnowledgeQueryOptions, 'staleDays'> = {}
): KnowledgeRecord | null =>
  collectKnowledgeRecords(projectRoot, options.staleDays ?? DEFAULT_STALE_DAYS).find((record) => record.id === id) ?? null;

export const getKnowledgeTimeline = (
  projectRoot: string,
  options: KnowledgeTimelineOptions = {}
): KnowledgeRecord[] =>
  applyKnowledgeFilters(collectKnowledgeRecords(projectRoot, options.staleDays ?? DEFAULT_STALE_DAYS), {
    ...options,
    order: options.order ?? 'desc'
  });

export const getKnowledgeProvenance = (
  projectRoot: string,
  id: string,
  options: Pick<KnowledgeQueryOptions, 'staleDays'> = {}
): KnowledgeProvenanceResult | null => {
  const records = collectKnowledgeRecords(projectRoot, options.staleDays ?? DEFAULT_STALE_DAYS);
  const record = records.find((entry) => entry.id === id);
  if (!record) {
    return null;
  }

  const evidenceIds = new Set(record.provenance.evidenceIds);
  const relatedRecordIds = new Set(record.provenance.relatedRecordIds);

  return {
    record,
    evidence: sortRecords(records.filter((entry) => entry.type === 'evidence' && evidenceIds.has(entry.id)), 'desc'),
    relatedRecords: sortRecords(records.filter((entry) => entry.id !== id && relatedRecordIds.has(entry.id)), 'desc')
  };
};

export const getStaleKnowledge = (
  projectRoot: string,
  options: Pick<KnowledgeQueryOptions, 'limit' | 'order' | 'staleDays'> = {}
): KnowledgeRecord[] =>
  applyKnowledgeFilters(collectKnowledgeRecords(projectRoot, options.staleDays ?? DEFAULT_STALE_DAYS), {
    ...options,
    order: options.order ?? 'desc'
  }).filter((record) => record.status === 'stale' || record.status === 'retired' || record.status === 'superseded');
