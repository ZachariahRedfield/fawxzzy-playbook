import fs from 'node:fs';
import path from 'node:path';
import { readPromotedPatterns } from '../compaction/promotionQueue.js';
import { readSession, SESSION_ARTIFACT_RELATIVE_PATH } from '../session/sessionStore.js';

type KnowledgeHitSource = 'promoted-pattern' | 'knowledge-candidate';

type MemorySourceKind = 'promoted-patterns' | 'knowledge-candidates' | 'session';

export type RuntimeMemorySource = {
  kind: MemorySourceKind;
  artifact: string;
  available: boolean;
  records: number;
};

export type RuntimeKnowledgeHit = {
  id: string;
  source: KnowledgeHitSource;
  summary: string;
  confidence?: number;
};

export type RuntimeRecentRelevantEvent = {
  kind: 'session-step' | 'pinned-artifact' | 'constraint' | 'unresolved-question';
  summary: string;
  occurredAt?: string;
};

export type RuntimeMemoryEnvelope = {
  memorySummary: string;
  memorySources: RuntimeMemorySource[];
  knowledgeHits: RuntimeKnowledgeHit[];
  recentRelevantEvents: RuntimeRecentRelevantEvent[];
};

type RuntimeMemoryOptions = {
  target?: string;
  question?: string;
  limit?: number;
};

type KnowledgeCandidatesArtifact = {
  candidates?: Array<{
    candidateId?: string;
    theme?: string;
    evidence?: Array<{ path?: string }>;
  }>;
};

const KNOWLEDGE_CANDIDATES_RELATIVE_PATH = '.playbook/knowledge/candidates.json' as const;

const normalizeTokens = (value: string): string[] =>
  value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3);

const scoreRelevance = (tokens: string[], content: string): number => {
  if (tokens.length === 0) {
    return 0;
  }

  const normalized = content.toLowerCase();
  return tokens.reduce((score, token) => (normalized.includes(token) ? score + 1 : score), 0);
};

const readKnowledgeCandidates = (projectRoot: string): KnowledgeCandidatesArtifact | null => {
  const artifactPath = path.join(projectRoot, KNOWLEDGE_CANDIDATES_RELATIVE_PATH);
  if (!fs.existsSync(artifactPath)) {
    return null;
  }

  return JSON.parse(fs.readFileSync(artifactPath, 'utf8')) as KnowledgeCandidatesArtifact;
};

const summarizeMemory = (input: { sources: RuntimeMemorySource[]; knowledgeHits: RuntimeKnowledgeHit[]; events: RuntimeRecentRelevantEvent[] }): string => {
  const available = input.sources.filter((source) => source.available).map((source) => source.kind);
  const sourceSummary = available.length > 0 ? available.join(', ') : 'none';
  return `Memory-aware retrieval consulted sources: ${sourceSummary}. knowledgeHits=${input.knowledgeHits.length}; recentRelevantEvents=${input.events.length}.`;
};

export const readRuntimeMemoryEnvelope = (projectRoot: string, options?: RuntimeMemoryOptions): RuntimeMemoryEnvelope => {
  const maxEntries = options?.limit ?? 3;
  const relevanceTokens = normalizeTokens(`${options?.target ?? ''} ${options?.question ?? ''}`.trim());

  const promotedPatterns = readPromotedPatterns(projectRoot);
  const promotedHits = promotedPatterns.promotedPatterns
    .map((pattern) => {
      const content = [pattern.id, pattern.canonicalPatternName, pattern.whyItExists, pattern.reusableEngineeringMeaning, ...pattern.examples].join(' ');
      return {
        id: pattern.id,
        source: 'promoted-pattern' as const,
        summary: pattern.whyItExists,
        confidence: pattern.confidence,
        relevance: scoreRelevance(relevanceTokens, content)
      };
    })
    .filter((entry) => relevanceTokens.length === 0 || entry.relevance > 0)
    .sort((left, right) => right.relevance - left.relevance || (right.confidence ?? 0) - (left.confidence ?? 0) || left.id.localeCompare(right.id))
    .slice(0, maxEntries)
    .map(({ relevance: _relevance, ...hit }) => hit);

  const candidates = readKnowledgeCandidates(projectRoot);
  const candidateHits = (candidates?.candidates ?? [])
    .map((candidate) => {
      const theme = candidate.theme ?? 'unknown-theme';
      const evidence = (candidate.evidence ?? []).map((entry) => entry.path).filter((value): value is string => typeof value === 'string');
      const content = [candidate.candidateId ?? '', theme, ...evidence].join(' ');
      return {
        id: candidate.candidateId ?? `candidate:${theme}`,
        source: 'knowledge-candidate' as const,
        summary: `Theme: ${theme}; evidence: ${evidence.length > 0 ? evidence.join(', ') : 'none'}`,
        relevance: scoreRelevance(relevanceTokens, content)
      };
    })
    .filter((entry) => relevanceTokens.length === 0 || entry.relevance > 0)
    .sort((left, right) => right.relevance - left.relevance || left.id.localeCompare(right.id))
    .slice(0, maxEntries)
    .map(({ relevance: _relevance, ...hit }) => hit);

  const session = readSession(projectRoot);
  const recentRelevantEvents: RuntimeRecentRelevantEvent[] = [];
  if (session) {
    recentRelevantEvents.push({
      kind: 'session-step',
      summary: `Session step: ${session.currentStep}; active goal: ${session.activeGoal}`,
      occurredAt: session.lastUpdatedTime
    });

    for (const artifact of session.pinnedArtifacts.slice(0, maxEntries)) {
      recentRelevantEvents.push({
        kind: 'pinned-artifact',
        summary: `Pinned ${artifact.kind}: ${artifact.artifact}`,
        occurredAt: artifact.pinnedAt
      });
    }

    for (const constraint of session.constraints.slice(0, maxEntries)) {
      recentRelevantEvents.push({
        kind: 'constraint',
        summary: constraint,
        occurredAt: session.lastUpdatedTime
      });
    }

    for (const unresolved of session.unresolvedQuestions.slice(0, maxEntries)) {
      recentRelevantEvents.push({
        kind: 'unresolved-question',
        summary: unresolved,
        occurredAt: session.lastUpdatedTime
      });
    }
  }

  const knowledgeHits = [...promotedHits, ...candidateHits].slice(0, maxEntries * 2);
  const memorySources: RuntimeMemorySource[] = [
    {
      kind: 'promoted-patterns',
      artifact: '.playbook/patterns-promoted.json',
      available: promotedPatterns.promotedPatterns.length > 0,
      records: promotedPatterns.promotedPatterns.length
    },
    {
      kind: 'knowledge-candidates',
      artifact: KNOWLEDGE_CANDIDATES_RELATIVE_PATH,
      available: Boolean(candidates),
      records: candidates?.candidates?.length ?? 0
    },
    {
      kind: 'session',
      artifact: SESSION_ARTIFACT_RELATIVE_PATH,
      available: session !== null,
      records: session ? 1 + session.pinnedArtifacts.length + session.constraints.length + session.unresolvedQuestions.length : 0
    }
  ];

  return {
    memorySummary: summarizeMemory({ sources: memorySources, knowledgeHits, events: recentRelevantEvents }),
    memorySources,
    knowledgeHits,
    recentRelevantEvents: recentRelevantEvents.slice(0, maxEntries * 2)
  };
};
