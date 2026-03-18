import fs from 'node:fs';
import path from 'node:path';
import { buildRepoAdoptionReadiness } from '../adoption/readiness.js';
import { readJsonIfExists, writeDeterministicJsonAtomic } from '../learning/io.js';
import { IMPROVEMENT_CANDIDATES_RELATIVE_PATH, type ImprovementCandidatesArtifact } from '../improvement/candidateEngine.js';
import { COMMAND_IMPROVEMENTS_RELATIVE_PATH } from '../improvement/commandProposals.js';
import { createStoryRecord, readStoriesArtifact, STORIES_RELATIVE_PATH, upsertStory, type CreateStoryInput, type StoryConfidence, type StoryPriority, type StoryRecord, type StorySeverity, type StoryType } from './stories.js';

export const STORY_CANDIDATES_SCHEMA_VERSION = '1.0' as const;
export const STORY_CANDIDATES_RELATIVE_PATH = '.playbook/story-candidates.json' as const;
const EXECUTION_RECEIPT_RELATIVE_PATH = '.playbook/execution-receipt.json' as const;
const EXECUTION_UPDATED_STATE_RELATIVE_PATH = '.playbook/execution-updated-state.json' as const;

export type StoryCandidateSourceKind = 'readiness_blocker' | 'improvement_candidate' | 'opportunity' | 'runtime_hardening' | 'execution_drift';

export type StoryCandidateSource = {
  kind: StoryCandidateSourceKind;
  id: string;
  title: string;
  summary: string;
  artifact_path: string;
  evidence: string[];
};

export type StoryCandidateRecord = {
  candidate_id: string;
  repo: string;
  title: string;
  type: StoryType;
  source: string;
  severity: StorySeverity;
  priority: StoryPriority;
  confidence: StoryConfidence;
  rationale: string;
  acceptance_criteria: string[];
  dependencies: string[];
  execution_lane: string | null;
  suggested_route: string | null;
  evidence: string[];
  grouping_keys: string[];
  source_findings: StoryCandidateSource[];
  promoted_story_id: string | null;
};

export type StoryCandidatesArtifact = {
  schemaVersion: typeof STORY_CANDIDATES_SCHEMA_VERSION;
  kind: 'story-candidates';
  generatedAt: string;
  repo: string;
  canonical_backlog_path: typeof STORIES_RELATIVE_PATH;
  advisory_only: true;
  explicit_promotion_required: true;
  source_artifacts: string[];
  candidates: StoryCandidateRecord[];
};

const unique = (values: string[]): string[] => [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
const slugify = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64) || 'candidate';
const rank = <T extends string>(value: T, order: readonly T[]): number => order.indexOf(value);
const maxByRank = <T extends string>(left: T, right: T, order: readonly T[]): T => rank(left, order) >= rank(right, order) ? left : right;
const mapSeverityToPriority = (severity: StorySeverity): StoryPriority => severity === 'critical' ? 'urgent' : severity === 'high' ? 'high' : 'medium';
const mapConfidenceScore = (score: number): StoryConfidence => score >= 0.8 ? 'high' : score >= 0.55 ? 'medium' : 'low';
const mapIssueToType = (text: string): StoryType => /bug|fail|drift|block|invalid|missing/i.test(text) ? 'governance' : /research|review/i.test(text) ? 'research' : 'maintenance';

type CandidateAccumulator = Omit<StoryCandidateRecord, 'candidate_id' | 'promoted_story_id'>;

const buildStoryId = (candidate: StoryCandidateRecord): string => candidate.candidate_id.replace(/^candidate-/, 'story-');

const summarizeSources = (sources: StoryCandidateSource[]): string => unique(sources.map((source) => source.title)).join('; ');

const candidateToStoryInput = (candidate: StoryCandidateRecord): CreateStoryInput => ({
  id: buildStoryId(candidate),
  title: candidate.title,
  type: candidate.type,
  source: candidate.source,
  severity: candidate.severity,
  priority: candidate.priority,
  confidence: candidate.confidence,
  rationale: candidate.rationale,
  acceptance_criteria: candidate.acceptance_criteria,
  dependencies: candidate.dependencies,
  execution_lane: candidate.execution_lane,
  suggested_route: candidate.suggested_route,
  evidence: candidate.evidence
});

const registerCandidate = (map: Map<string, CandidateAccumulator>, key: string, seed: CandidateAccumulator): void => {
  const current = map.get(key);
  if (!current) {
    map.set(key, {
      ...seed,
      evidence: unique(seed.evidence),
      acceptance_criteria: unique(seed.acceptance_criteria),
      dependencies: unique(seed.dependencies),
      grouping_keys: unique(seed.grouping_keys),
      source_findings: [...seed.source_findings].sort((a, b) => a.id.localeCompare(b.id))
    });
    return;
  }

  map.set(key, {
    ...current,
    title: current.title.length >= seed.title.length ? current.title : seed.title,
    type: current.type === seed.type ? current.type : mapIssueToType(`${current.type} ${seed.type}`),
    severity: maxByRank(current.severity, seed.severity, ['low', 'medium', 'high', 'critical']),
    priority: maxByRank(current.priority, seed.priority, ['low', 'medium', 'high', 'urgent']),
    confidence: maxByRank(current.confidence, seed.confidence, ['low', 'medium', 'high']),
    rationale: unique([current.rationale, seed.rationale]).join(' '),
    acceptance_criteria: unique([...current.acceptance_criteria, ...seed.acceptance_criteria]),
    dependencies: unique([...current.dependencies, ...seed.dependencies]),
    execution_lane: current.execution_lane ?? seed.execution_lane,
    suggested_route: current.suggested_route ?? seed.suggested_route,
    evidence: unique([...current.evidence, ...seed.evidence]),
    grouping_keys: unique([...current.grouping_keys, ...seed.grouping_keys]),
    source_findings: [...current.source_findings, ...seed.source_findings].sort((a, b) => a.id.localeCompare(b.id) || a.kind.localeCompare(b.kind))
  });
};

const deriveReadinessCandidates = (repoRoot: string, repoName: string, map: Map<string, CandidateAccumulator>, sourceArtifacts: Set<string>): void => {
  const readiness = buildRepoAdoptionReadiness({ repoRoot, connected: true });
  if (readiness.blockers.length === 0) return;
  sourceArtifacts.add('.playbook/repo-index.json');
  sourceArtifacts.add('.playbook/plan.json');
  sourceArtifacts.add('.playbook/policy-apply-result.json');
  sourceArtifacts.add('.playbook/repo-graph.json');
  registerCandidate(map, 'governance-readiness-blockers', {
    repo: repoName,
    title: 'Resolve governed readiness blockers before promoting new backlog work',
    type: 'governance',
    source: 'derived:readiness',
    severity: readiness.lifecycle_stage === 'ready' ? 'low' : 'high',
    priority: readiness.lifecycle_stage === 'ready' ? 'low' : 'high',
    confidence: 'high',
    rationale: `Readiness blockers require durable interpretation before they become backlog work. Current lifecycle stage: ${readiness.lifecycle_stage}.`,
    acceptance_criteria: unique(readiness.blockers.map((blocker) => blocker.next_command)),
    dependencies: [],
    execution_lane: null,
    suggested_route: 'deterministic_local',
    evidence: unique(readiness.blockers.map((blocker) => `${blocker.code}: ${blocker.message}`)),
    grouping_keys: ['readiness', 'governance'],
    source_findings: readiness.blockers.map((blocker) => ({
      kind: 'readiness_blocker',
      id: blocker.code,
      title: blocker.code,
      summary: blocker.message,
      artifact_path: '.playbook/readiness (derived)',
      evidence: [blocker.next_command]
    }))
  });
};

const deriveImprovementCandidates = (repoRoot: string, repoName: string, map: Map<string, CandidateAccumulator>, sourceArtifacts: Set<string>): void => {
  const artifact = readJsonIfExists<ImprovementCandidatesArtifact>(path.join(repoRoot, IMPROVEMENT_CANDIDATES_RELATIVE_PATH));
  if (!artifact) return;
  sourceArtifacts.add(IMPROVEMENT_CANDIDATES_RELATIVE_PATH);
  sourceArtifacts.add(COMMAND_IMPROVEMENTS_RELATIVE_PATH);

  for (const candidate of artifact.candidates ?? []) {
    const group = `${candidate.category}:${candidate.improvement_tier}`;
    registerCandidate(map, `improvement-${group}`, {
      repo: repoName,
      title: `${candidate.category.replace(/_/g, ' ')} improvements with recurring governed evidence`,
      type: candidate.category === 'ontology' ? 'research' : 'maintenance',
      source: 'derived:improvement-candidates',
      severity: candidate.gating_tier === 'GOVERNANCE' ? 'high' : 'medium',
      priority: candidate.gating_tier === 'GOVERNANCE' ? 'high' : 'medium',
      confidence: mapConfidenceScore(candidate.confidence_score),
      rationale: 'Candidate stories require grouping, dedupe, and explicit promotion instead of one-finding to one-story conversion.',
      acceptance_criteria: [candidate.suggested_action],
      dependencies: [],
      execution_lane: null,
      suggested_route: 'deterministic_local',
      evidence: [candidate.observation, ...candidate.blocking_reasons],
      grouping_keys: [candidate.category, candidate.improvement_tier, candidate.gating_tier],
      source_findings: [{
        kind: 'improvement_candidate',
        id: candidate.candidate_id,
        title: candidate.candidate_id,
        summary: candidate.observation,
        artifact_path: IMPROVEMENT_CANDIDATES_RELATIVE_PATH,
        evidence: unique([candidate.suggested_action, ...candidate.evidence.event_ids])
      }]
    });
  }

  const topOpportunity = artifact.opportunity_analysis?.top_recommendation;
  const secondary = artifact.opportunity_analysis?.secondary_queue ?? [];
  for (const opportunity of [topOpportunity, ...secondary].filter(Boolean)) {
    registerCandidate(map, `opportunity-${opportunity!.heuristic_class}`, {
      repo: repoName,
      title: opportunity!.title,
      type: 'maintenance',
      source: 'derived:opportunity-analysis',
      severity: opportunity!.priority_score >= 80 ? 'high' : 'medium',
      priority: opportunity!.priority_score >= 80 ? 'high' : 'medium',
      confidence: mapConfidenceScore(opportunity!.confidence),
      rationale: opportunity!.why_it_matters,
      acceptance_criteria: [opportunity!.likely_change_shape],
      dependencies: [],
      execution_lane: null,
      suggested_route: 'deterministic_local',
      evidence: unique([...(opportunity!.rationale ?? []), ...(opportunity!.evidence ?? []).map((entry) => `${entry.file}:${entry.lines.join(',')}`)]),
      grouping_keys: ['opportunity', opportunity!.heuristic_class],
      source_findings: [{
        kind: 'opportunity',
        id: opportunity!.opportunity_id,
        title: opportunity!.title,
        summary: opportunity!.why_it_matters,
        artifact_path: IMPROVEMENT_CANDIDATES_RELATIVE_PATH,
        evidence: (opportunity!.evidence ?? []).map((entry) => `${entry.file}:${entry.lines.join(',')}`)
      }]
    });
  }

  for (const proposal of artifact.command_improvements?.runtime_hardening?.proposals ?? []) {
    registerCandidate(map, `runtime-hardening-${proposal.issue_type}`, {
      repo: repoName,
      title: `Runtime hardening for ${proposal.issue_type.replace(/_/g, ' ')}`,
      type: 'maintenance',
      source: 'derived:runtime-hardening',
      severity: proposal.gating_tier === 'GOVERNANCE' ? 'high' : 'medium',
      priority: proposal.gating_tier === 'GOVERNANCE' ? 'high' : 'medium',
      confidence: mapConfidenceScore(proposal.confidence_score),
      rationale: proposal.rationale,
      acceptance_criteria: [proposal.proposed_improvement],
      dependencies: [],
      execution_lane: null,
      suggested_route: 'deterministic_local',
      evidence: unique([proposal.issue_type, ...proposal.blocking_reasons]),
      grouping_keys: ['runtime-hardening', proposal.issue_type],
      source_findings: [{
        kind: 'runtime_hardening',
        id: proposal.proposal_id,
        title: proposal.issue_type,
        summary: proposal.rationale,
        artifact_path: IMPROVEMENT_CANDIDATES_RELATIVE_PATH,
        evidence: [proposal.proposed_improvement]
      }]
    });
  }
};

const deriveExecutionDriftCandidates = (repoRoot: string, repoName: string, map: Map<string, CandidateAccumulator>, sourceArtifacts: Set<string>): void => {
  const receipt = readJsonIfExists<Record<string, unknown>>(path.join(repoRoot, EXECUTION_RECEIPT_RELATIVE_PATH));
  const updated = readJsonIfExists<Record<string, unknown>>(path.join(repoRoot, EXECUTION_UPDATED_STATE_RELATIVE_PATH));
  const drift = Array.isArray((receipt?.verification_summary as Record<string, unknown> | undefined)?.planned_vs_actual_drift)
    ? ((receipt!.verification_summary as Record<string, unknown>).planned_vs_actual_drift as unknown[]).map(String)
    : [];
  const byStatus = (updated?.summary as Record<string, unknown> | undefined)?.by_reconciliation_status as Record<string, unknown> | undefined;
  const completedWithDrift = typeof byStatus?.completed_with_drift === 'number' ? Number(byStatus.completed_with_drift) : 0;
  const stale = typeof byStatus?.stale_plan_or_superseded === 'number' ? Number(byStatus.stale_plan_or_superseded) : 0;
  if (drift.length === 0 && completedWithDrift === 0 && stale === 0) return;
  sourceArtifacts.add(EXECUTION_RECEIPT_RELATIVE_PATH);
  sourceArtifacts.add(EXECUTION_UPDATED_STATE_RELATIVE_PATH);
  registerCandidate(map, 'execution-drift-review', {
    repo: repoName,
    title: 'Review execution drift before promoting follow-up backlog work',
    type: 'governance',
    source: 'derived:execution-replay',
    severity: stale > 0 ? 'high' : 'medium',
    priority: stale > 0 ? 'high' : 'medium',
    confidence: 'high',
    rationale: 'Raw finding to automatic story conversion creates backlog spam and weak planning signal; drift evidence should be grouped into a review-first candidate.',
    acceptance_criteria: unique([
      'Inspect .playbook/execution-receipt.json planned_vs_actual_drift entries.',
      'Inspect .playbook/execution-updated-state.json reconciliation summaries before promotion.'
    ]),
    dependencies: [],
    execution_lane: null,
    suggested_route: 'deterministic_local',
    evidence: unique([...drift, `completed_with_drift:${completedWithDrift}`, `stale_plan_or_superseded:${stale}`]),
    grouping_keys: ['execution', 'drift'],
    source_findings: [{
      kind: 'execution_drift',
      id: 'planned-vs-actual-drift',
      title: 'planned_vs_actual_drift',
      summary: drift[0] ?? `completed_with_drift=${completedWithDrift}; stale_plan_or_superseded=${stale}`,
      artifact_path: EXECUTION_RECEIPT_RELATIVE_PATH,
      evidence: unique([...drift, `completed_with_drift:${completedWithDrift}`, `stale_plan_or_superseded:${stale}`])
    }]
  });
};

export const generateStoryCandidates = (repoRoot: string, options?: { generatedAt?: string }): StoryCandidatesArtifact => {
  const repoName = path.basename(repoRoot);
  const sourceArtifacts = new Set<string>();
  const map = new Map<string, CandidateAccumulator>();
  deriveReadinessCandidates(repoRoot, repoName, map, sourceArtifacts);
  deriveImprovementCandidates(repoRoot, repoName, map, sourceArtifacts);
  deriveExecutionDriftCandidates(repoRoot, repoName, map, sourceArtifacts);
  const backlog = readStoriesArtifact(repoRoot);
  const backlogIds = new Set(backlog.stories.map((story) => story.id));
  const candidates = [...map.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([key, value]) => {
    const candidate_id = `candidate-${slugify(key)}`;
    const storyId = buildStoryId({ ...value, candidate_id, promoted_story_id: null });
    return {
      ...value,
      candidate_id,
      title: value.title.trim(),
      rationale: value.rationale.trim(),
      evidence: unique(value.evidence),
      acceptance_criteria: unique(value.acceptance_criteria),
      dependencies: unique(value.dependencies),
      grouping_keys: unique(value.grouping_keys),
      source_findings: value.source_findings.map((source) => ({ ...source, evidence: unique(source.evidence) })),
      promoted_story_id: backlogIds.has(storyId) ? storyId : null
    } satisfies StoryCandidateRecord;
  });
  return {
    schemaVersion: STORY_CANDIDATES_SCHEMA_VERSION,
    kind: 'story-candidates',
    generatedAt: options?.generatedAt ?? new Date().toISOString(),
    repo: repoName,
    canonical_backlog_path: STORIES_RELATIVE_PATH,
    advisory_only: true,
    explicit_promotion_required: true,
    source_artifacts: [...sourceArtifacts].sort((a, b) => a.localeCompare(b)),
    candidates
  };
};

export const writeStoryCandidatesArtifact = (repoRoot: string, artifact: StoryCandidatesArtifact): void => {
  writeDeterministicJsonAtomic(path.join(repoRoot, STORY_CANDIDATES_RELATIVE_PATH), artifact);
};

export const readStoryCandidatesArtifact = (repoRoot: string): StoryCandidatesArtifact => {
  const artifact = readJsonIfExists<StoryCandidatesArtifact>(path.join(repoRoot, STORY_CANDIDATES_RELATIVE_PATH));
  return artifact ?? generateStoryCandidates(repoRoot, { generatedAt: new Date(0).toISOString() });
};

export const explainStoryCandidate = (candidate: StoryCandidateRecord): { candidate_id: string; summary: string; grouped_findings: number; finding_titles: string[]; evidence: string[]; promotion: { required: true; story_id: string } } => ({
  candidate_id: candidate.candidate_id,
  summary: `${candidate.title}. Grouped ${candidate.source_findings.length} finding(s): ${summarizeSources(candidate.source_findings)}.`,
  grouped_findings: candidate.source_findings.length,
  finding_titles: unique(candidate.source_findings.map((source) => source.title)),
  evidence: candidate.evidence,
  promotion: { required: true, story_id: buildStoryId(candidate) }
});

export const promoteStoryCandidate = (repoRoot: string, candidateId: string): { candidate: StoryCandidateRecord; story: StoryRecord; storiesArtifactPath: typeof STORIES_RELATIVE_PATH } => {
  const candidates = generateStoryCandidates(repoRoot);
  writeStoryCandidatesArtifact(repoRoot, candidates);
  const candidate = candidates.candidates.find((entry) => entry.candidate_id === candidateId);
  if (!candidate) throw new Error(`Story candidate not found: ${candidateId}`);
  const current = readStoriesArtifact(repoRoot);
  const story = createStoryRecord(current.repo, candidateToStoryInput(candidate));
  const next = upsertStory(current, story);
  writeDeterministicJsonAtomic(path.join(repoRoot, STORIES_RELATIVE_PATH), next);
  return { candidate, story, storiesArtifactPath: STORIES_RELATIVE_PATH };
};
