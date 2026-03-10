import type { CandidatePatternPreviewArtifact, GraphGroupArtifact, GraphSnapshot } from '../schema/graphMemory.js';
import type { PatternCardCollectionArtifact } from '../schema/patternCard.js';
import type { PromotionDecisionArtifact } from '../schema/promotionDecision.js';
import type { RunCycle } from '../schema/runCycle.js';
import type { ContractProposal } from '../schema/contractProposal.js';
import type { MetaFinding, MetaFindingsArtifact, MetaImprovementProposal } from '../schema/metaFinding.js';
import type { MetaPattern, MetaPatternsArtifact } from '../schema/metaPattern.js';

export type MetaAnalysisInput = {
  runCycles: RunCycle[];
  graphSnapshots: GraphSnapshot[];
  groups: GraphGroupArtifact[];
  candidatePatterns: CandidatePatternPreviewArtifact[];
  patternCards: PatternCardCollectionArtifact[];
  promotionDecisions: PromotionDecisionArtifact[];
  contractHistory: ContractProposal[];
  createdAt?: string;
};

const round4 = (value: number): number => Math.round(value * 10_000) / 10_000;
const safeDiv = (num: number, denom: number): number => (denom <= 0 ? 0 : num / denom);

const toFinding = (finding: Omit<MetaFinding, 'findingId'>): MetaFinding => ({
  findingId: `meta-finding:${finding.type}`,
  ...finding
});

const buildImprovementProposal = (finding: MetaFinding, createdAt: string): MetaImprovementProposal => ({
  proposalId: `meta-proposal:${finding.type}`,
  findingId: finding.findingId,
  createdAt,
  kind: 'playbook-meta-improvement-proposal',
  status: 'draft',
  title: `Improve ${finding.type.replaceAll('_', ' ')}`,
  summary: finding.recommendation,
  actions: [
    'review meta finding evidence',
    'define deterministic remediation experiment',
    'submit proposal through normal doctrine governance path'
  ],
  guardrail: 'meta-proposals-cannot-mutate-doctrine',
  artifactRefs: finding.artifactRefs
});

export const buildMetaPatterns = (input: MetaAnalysisInput): MetaPatternsArtifact => {
  const patterns = new Map<string, MetaPattern>();

  for (const artifact of input.patternCards) {
    for (const card of artifact.cards) {
      const key = card.canonicalKey;
      const existing = patterns.get(key);
      const isRejected = card.state === 'rejected';
      const promoted = card.state === 'promoted' || card.state === 'superseded';
      const firstSeenAt = existing?.firstSeenAt ? (existing.firstSeenAt < card.createdAt ? existing.firstSeenAt : card.createdAt) : card.createdAt;
      const lastSeenAt = existing?.lastSeenAt ? (existing.lastSeenAt > card.updatedAt ? existing.lastSeenAt : card.updatedAt) : card.updatedAt;

      patterns.set(key, {
        patternId: existing?.patternId ?? card.patternId,
        canonicalKey: key,
        occurrences: (existing?.occurrences ?? 0) + 1,
        promotedCount: (existing?.promotedCount ?? 0) + (promoted ? 1 : 0),
        rejectedCount: (existing?.rejectedCount ?? 0) + (isRejected ? 1 : 0),
        firstSeenAt,
        lastSeenAt,
        linkedContractRefs: Array.from(new Set([...(existing?.linkedContractRefs ?? []), ...card.linkedContractRefs])).sort(),
        sourceArtifactRefs: Array.from(new Set([...(existing?.sourceArtifactRefs ?? []), `${artifact.kind}:${artifact.artifactId}`])).sort()
      });
    }
  }

  return {
    schemaVersion: '1.0',
    kind: 'playbook-meta-patterns',
    createdAt: input.createdAt ?? new Date().toISOString(),
    patterns: [...patterns.values()].sort((a, b) => a.canonicalKey.localeCompare(b.canonicalKey))
  };
};

export const buildMetaFindings = (input: MetaAnalysisInput): MetaFindingsArtifact => {
  const createdAt = input.createdAt ?? new Date().toISOString();
  const allDecisions = input.promotionDecisions.flatMap((batch) => batch.decisions);
  const rejectCount = allDecisions.filter((decision) => decision.decisionType === 'reject').length;
  const promoteDecisions = allDecisions.filter((decision) => decision.decisionType === 'promote');

  const cycleById = new Map(input.runCycles.map((cycle) => [cycle.runCycleId, cycle]));
  const promotionLatencyHours = promoteDecisions
    .map((decision) => {
      const cycle = cycleById.get(decision.originCycleId);
      if (!cycle) return undefined;
      const decisionMs = Date.parse(decision.timestamp);
      const cycleMs = Date.parse(cycle.createdAt);
      if (Number.isNaN(decisionMs) || Number.isNaN(cycleMs)) return undefined;
      return (decisionMs - cycleMs) / 3_600_000;
    })
    .filter((value): value is number => value !== undefined && Number.isFinite(value) && value >= 0);

  const avgPromotionLatency = round4(
    safeDiv(
      promotionLatencyHours.reduce((sum, value) => sum + value, 0),
      promotionLatencyHours.length
    )
  );

  const metaPatterns = buildMetaPatterns(input);
  const reusedPatterns = metaPatterns.patterns.filter((pattern) => pattern.occurrences > 1).length;
  const patternReuseRate = round4(safeDiv(reusedPatterns, metaPatterns.patterns.length));

  const driftCycleCount = input.runCycles.filter((cycle) => cycle.metrics.driftScore > 0.2).length;
  const contractDriftRate = round4(safeDiv(driftCycleCount, input.runCycles.length));

  const entropyValues = [...input.runCycles]
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((cycle) => cycle.metrics.entropyBudget);
  const entropyTrend = entropyValues.length < 2 ? 0 : round4(entropyValues[entropyValues.length - 1] - entropyValues[0]);

  const candidateTitles = input.candidatePatterns.flatMap((artifact) => artifact.candidates.map((candidate) => candidate.title.trim().toLowerCase()));
  const duplicateCandidateCount = candidateTitles.length - new Set(candidateTitles).size;
  const duplicationRate = round4(safeDiv(duplicateCandidateCount, candidateTitles.length));

  const findings: MetaFinding[] = [
    toFinding({
      type: 'promotion_latency',
      title: 'Promotion latency',
      summary: 'Average time from run cycle creation to promote decisions.',
      severity: avgPromotionLatency > 48 ? 'high' : avgPromotionLatency > 24 ? 'medium' : 'low',
      value: avgPromotionLatency,
      threshold: 24,
      trend: 'stable',
      artifactRefs: input.promotionDecisions.map((batch) => `promotion-decision:${batch.batchId}`),
      recommendation: 'Keep promotion review queues short and close decisions within one daily cycle when possible.'
    }),
    toFinding({
      type: 'rejection_rate',
      title: 'Promotion rejection rate',
      summary: 'Ratio of rejected promotion decisions to all decisions.',
      severity: rejectCount > 0 ? 'medium' : 'low',
      value: round4(safeDiv(rejectCount, allDecisions.length)),
      threshold: 0.25,
      trend: 'stable',
      artifactRefs: input.promotionDecisions.map((batch) => `promotion-decision:${batch.batchId}`),
      recommendation: 'Inspect repeated rejection causes and convert them into clearer readiness heuristics.'
    }),
    toFinding({
      type: 'pattern_reuse',
      title: 'Pattern reuse',
      summary: 'Share of canonical patterns observed multiple times.',
      severity: patternReuseRate < 0.2 ? 'medium' : 'low',
      value: patternReuseRate,
      threshold: 0.2,
      trend: patternReuseRate >= 0.2 ? 'improving' : 'degrading',
      artifactRefs: metaPatterns.patterns.flatMap((pattern) => pattern.sourceArtifactRefs),
      recommendation: 'Raise candidate synthesis quality to produce reusable canonical patterns across cycles.'
    }),
    toFinding({
      type: 'contract_drift',
      title: 'Contract drift pressure',
      summary: 'Rate of run cycles with elevated drift score.',
      severity: contractDriftRate > 0.35 ? 'high' : contractDriftRate > 0.15 ? 'medium' : 'low',
      value: contractDriftRate,
      threshold: 0.15,
      trend: contractDriftRate > 0.15 ? 'degrading' : 'stable',
      artifactRefs: input.runCycles.map((cycle) => `run-cycle:${cycle.runCycleId}`),
      recommendation: 'Prioritize doctrine review when drift score remains above baseline for consecutive cycles.'
    }),
    toFinding({
      type: 'entropy_trend',
      title: 'Entropy budget trend',
      summary: 'Delta of entropy budget across chronological run cycles.',
      severity: entropyTrend > 0.1 ? 'high' : entropyTrend > 0.03 ? 'medium' : 'low',
      value: entropyTrend,
      threshold: 0,
      trend: entropyTrend > 0 ? 'degrading' : entropyTrend < 0 ? 'improving' : 'stable',
      artifactRefs: input.runCycles.map((cycle) => `run-cycle:${cycle.runCycleId}`),
      recommendation: 'Increase deterministic compaction and reuse when entropy budget trends upward.'
    }),
    toFinding({
      type: 'duplication',
      title: 'Candidate duplication',
      summary: 'Fraction of candidate patterns that repeat by normalized title.',
      severity: duplicationRate > 0.2 ? 'high' : duplicationRate > 0.1 ? 'medium' : 'low',
      value: duplicationRate,
      threshold: 0.1,
      trend: duplicationRate > 0.1 ? 'degrading' : 'stable',
      artifactRefs: input.candidatePatterns.map((artifact) => `candidate-patterns:${artifact.artifactId}`),
      recommendation: 'Merge structurally equivalent candidates earlier to reduce review overhead.'
    })
  ];

  const proposals = findings
    .filter((finding) => finding.severity !== 'low')
    .map((finding) => buildImprovementProposal(finding, createdAt));

  return {
    schemaVersion: '1.0',
    kind: 'playbook-meta-findings',
    createdAt,
    findings,
    proposals
  };
};
