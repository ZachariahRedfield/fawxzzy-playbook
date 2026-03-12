import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type { LearnDraftResult, KnowledgeCandidate } from '../schema/knowledgeCandidate.js';

export const KNOWLEDGE_CANDIDATES_PATH = '.playbook/knowledge/candidates.json' as const;

export type KnowledgeKind = 'decisions' | 'patterns' | 'failure-modes' | 'invariants';

export type KnowledgeProvenance = {
  promotedFromCandidateId: string;
  promotedAt: string;
  sourceArtifactPath: string;
  evidence: Array<{ path: string }>;
};

export type PromotedKnowledge = {
  id: string;
  fingerprint: string;
  theme: string;
  supersedes: string[];
  supersededBy: string[];
  provenance: KnowledgeProvenance;
};

export type PromotedKnowledgeArtifact = {
  schemaVersion: '1.0';
  kind: 'playbook-promoted-knowledge';
  knowledgeKind: KnowledgeKind;
  updatedAt: string;
  items: PromotedKnowledge[];
};

export type PromoteKnowledgeResult = {
  schemaVersion: '1.0';
  command: 'memory.promote';
  knowledgeKind: KnowledgeKind;
  promoted: PromotedKnowledge;
  totalItems: number;
};

export type PruneMemoryResult = {
  schemaVersion: '1.0';
  command: 'memory.prune';
  staleCandidatesPruned: number;
  supersededPruned: number;
  duplicatesCollapsed: number;
  knowledge: Record<KnowledgeKind, { before: number; after: number }>;
};

const KNOWLEDGE_FILES: Record<KnowledgeKind, string> = {
  decisions: '.playbook/memory/knowledge/decisions.json',
  patterns: '.playbook/memory/knowledge/patterns.json',
  'failure-modes': '.playbook/memory/knowledge/failure-modes.json',
  invariants: '.playbook/memory/knowledge/invariants.json'
};

const sortUnique = (values: string[]): string[] => Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));

const candidateFingerprint = (candidate: KnowledgeCandidate): string =>
  createHash('sha256')
    .update(
      JSON.stringify({
        theme: candidate.theme,
        evidence: sortUnique(candidate.evidence.map((entry) => entry.path))
      })
    )
    .digest('hex');

const classifyKind = (theme: string): KnowledgeKind => {
  const normalized = theme.toLowerCase();
  if (normalized.includes('failure') || normalized.includes('incident') || normalized.includes('postmortem')) return 'failure-modes';
  if (normalized.includes('invariant') || normalized.includes('guardrail')) return 'invariants';
  if (normalized.includes('decision') || normalized.includes('adr')) return 'decisions';
  return 'patterns';
};

const readJson = <T>(filePath: string): T | null => {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
};

const writeJson = (filePath: string, value: unknown): void => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
};

const readKnowledgeArtifact = (repoRoot: string, kind: KnowledgeKind): PromotedKnowledgeArtifact => {
  const absolute = path.join(repoRoot, KNOWLEDGE_FILES[kind]);
  const existing = readJson<PromotedKnowledgeArtifact>(absolute);
  if (existing) {
    return {
      ...existing,
      items: Array.isArray(existing.items) ? existing.items : []
    };
  }

  return {
    schemaVersion: '1.0',
    kind: 'playbook-promoted-knowledge',
    knowledgeKind: kind,
    updatedAt: new Date(0).toISOString(),
    items: []
  };
};

const writeKnowledgeArtifact = (repoRoot: string, kind: KnowledgeKind, artifact: PromotedKnowledgeArtifact): void => {
  writeJson(path.join(repoRoot, KNOWLEDGE_FILES[kind]), artifact);
};

const readCandidateDraft = (repoRoot: string): LearnDraftResult => {
  const absolute = path.join(repoRoot, KNOWLEDGE_CANDIDATES_PATH);
  const loaded = readJson<LearnDraftResult>(absolute);
  if (!loaded) {
    throw new Error(`Missing knowledge candidates artifact at ${KNOWLEDGE_CANDIDATES_PATH}. Run "playbook learn draft" first.`);
  }
  return loaded;
};

export const promoteKnowledgeCandidate = (repoRoot: string, fromCandidateId: string): PromoteKnowledgeResult => {
  const draft = readCandidateDraft(repoRoot);
  const candidate = draft.candidates.find((entry) => entry.candidateId === fromCandidateId);
  if (!candidate) {
    throw new Error(`Candidate not found: ${fromCandidateId}`);
  }

  const knowledgeKind = classifyKind(candidate.theme);
  const artifact = readKnowledgeArtifact(repoRoot, knowledgeKind);
  const now = new Date().toISOString();

  const promoted: PromotedKnowledge = {
    id: `km-${candidate.candidateId}`,
    fingerprint: candidateFingerprint(candidate),
    theme: candidate.theme,
    supersedes: [],
    supersededBy: [],
    provenance: {
      promotedFromCandidateId: candidate.candidateId,
      promotedAt: now,
      sourceArtifactPath: KNOWLEDGE_CANDIDATES_PATH,
      evidence: candidate.evidence
    }
  };

  const supersedes = artifact.items
    .filter((entry) => entry.fingerprint === promoted.fingerprint && entry.id !== promoted.id)
    .map((entry) => entry.id);

  promoted.supersedes = sortUnique(supersedes);

  const updatedItems = artifact.items
    .map((entry) => {
      if (!promoted.supersedes.includes(entry.id)) {
        return entry;
      }
      return {
        ...entry,
        supersededBy: sortUnique([...entry.supersededBy, promoted.id])
      };
    })
    .filter((entry) => entry.id !== promoted.id);

  updatedItems.push(promoted);

  const updatedArtifact: PromotedKnowledgeArtifact = {
    ...artifact,
    updatedAt: now,
    items: updatedItems.sort((left, right) => left.id.localeCompare(right.id))
  };

  writeKnowledgeArtifact(repoRoot, knowledgeKind, updatedArtifact);

  return {
    schemaVersion: '1.0',
    command: 'memory.promote',
    knowledgeKind,
    promoted,
    totalItems: updatedArtifact.items.length
  };
};

const isStaleCandidateDraft = (repoRoot: string, staleDays: number): boolean => {
  const candidatePath = path.join(repoRoot, KNOWLEDGE_CANDIDATES_PATH);
  if (!fs.existsSync(candidatePath)) {
    return false;
  }

  const stats = fs.statSync(candidatePath);
  const ageMs = Date.now() - stats.mtimeMs;
  return ageMs > staleDays * 24 * 60 * 60 * 1000;
};

export const pruneMemory = (repoRoot: string, options?: { staleDays?: number }): PruneMemoryResult => {
  const staleDays = options?.staleDays ?? 30;
  let staleCandidatesPruned = 0;
  let supersededPruned = 0;
  let duplicatesCollapsed = 0;

  if (isStaleCandidateDraft(repoRoot, staleDays)) {
    const candidatePath = path.join(repoRoot, KNOWLEDGE_CANDIDATES_PATH);
    const loaded = readJson<LearnDraftResult>(candidatePath);
    staleCandidatesPruned = loaded?.candidates.length ?? 0;
    const replacement: LearnDraftResult = {
      ...(loaded ?? {
        schemaVersion: '1.0',
        command: 'learn-draft',
        baseRef: 'HEAD',
        baseSha: '',
        headSha: '',
        diffContext: false,
        changedFiles: [],
        candidates: []
      }),
      candidates: []
    };
    writeJson(candidatePath, replacement);
  }

  const knowledge: PruneMemoryResult['knowledge'] = {
    decisions: { before: 0, after: 0 },
    patterns: { before: 0, after: 0 },
    'failure-modes': { before: 0, after: 0 },
    invariants: { before: 0, after: 0 }
  };

  (Object.keys(KNOWLEDGE_FILES) as KnowledgeKind[]).forEach((kind) => {
    const artifact = readKnowledgeArtifact(repoRoot, kind);
    knowledge[kind].before = artifact.items.length;

    const nonSuperseded = artifact.items.filter((entry) => entry.supersededBy.length === 0);
    supersededPruned += artifact.items.length - nonSuperseded.length;

    const seen = new Set<string>();
    const deduped: PromotedKnowledge[] = [];
    for (const entry of nonSuperseded.sort((left, right) => left.id.localeCompare(right.id))) {
      if (seen.has(entry.fingerprint)) {
        duplicatesCollapsed += 1;
        continue;
      }
      seen.add(entry.fingerprint);
      deduped.push(entry);
    }

    const pruned: PromotedKnowledgeArtifact = {
      ...artifact,
      updatedAt: new Date().toISOString(),
      items: deduped
    };
    knowledge[kind].after = deduped.length;
    writeKnowledgeArtifact(repoRoot, kind, pruned);
  });

  return {
    schemaVersion: '1.0',
    command: 'memory.prune',
    staleCandidatesPruned,
    supersededPruned,
    duplicatesCollapsed,
    knowledge
  };
};
