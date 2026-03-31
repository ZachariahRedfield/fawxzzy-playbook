import fs from 'node:fs';
import path from 'node:path';
import type { InteropFollowupsArtifact, InteropFollowupRow } from './interopFollowups.js';
import {
  INTEROP_FOLLOWUPS_DEFAULT_FILE,
  INTEROP_UPDATED_TRUTH_DEFAULT_FILE
} from './interopFollowups.js';
import type { InteropUpdatedTruthArtifact } from './playbookLifelineInterop.js';

export const INTEROP_PLAN_HINTS_DEFAULT_FILE = '.playbook/interop-plan-hints.json' as const;
export const INTEROP_PLAN_HINTS_SCHEMA_VERSION = '1.0' as const;

type InteropPlanHintReasonCode =
  | 'repeated-blocked-runtime-outcome'
  | 'repeated-failed-runtime-outcome'
  | 'completed-bounded-state-advance';

type InteropPlanHintAction =
  | 'adjust-plan-for-blocked-outcome'
  | 'add-bounded-retry-or-recovery-step'
  | 'promote-next-approved-planning-step';

export type InteropPlanHintRow = {
  hintId: string;
  requestId: string;
  receiptId: string;
  action: InteropPlanHintAction;
  receiptType: string;
  canonicalOutcomeSummary: InteropUpdatedTruthArtifact['updates'][number]['canonicalOutcomeSummary'];
  recommendedPlanTarget: string;
  reasonCode: InteropPlanHintReasonCode;
  confidence: {
    score: number;
    rationale: string;
  };
  provenanceRefs: string[];
  nextActionText: string;
};

export type InteropPlanHintsArtifact = {
  schemaVersion: typeof INTEROP_PLAN_HINTS_SCHEMA_VERSION;
  kind: 'interop-plan-hints-artifact';
  command: 'interop plan-hints';
  reviewOnly: true;
  proposalOnly: true;
  authority: {
    mutation: 'read-only';
    promotion: 'review-required';
  };
  sourceArtifacts: {
    followupsPath: typeof INTEROP_FOLLOWUPS_DEFAULT_FILE;
    updatedTruthPath: typeof INTEROP_UPDATED_TRUTH_DEFAULT_FILE;
    contractSourceHash: string;
    contractSourceRef: string;
    contractSourcePath: string;
  };
  hints: InteropPlanHintRow[];
};

const deterministicStringify = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;
const uniqueSorted = (values: string[]): string[] => [...new Set(values)].sort((a, b) => a.localeCompare(b));
const parseFollowups = (raw: string): InteropFollowupsArtifact => JSON.parse(raw) as InteropFollowupsArtifact;
const parseUpdatedTruth = (raw: string): InteropUpdatedTruthArtifact => JSON.parse(raw) as InteropUpdatedTruthArtifact;

const buildHintDecision = (input: {
  update: InteropUpdatedTruthArtifact['updates'][number];
  repeats: number;
}): Omit<InteropPlanHintRow, 'hintId' | 'requestId' | 'receiptId' | 'receiptType' | 'canonicalOutcomeSummary' | 'provenanceRefs'> | null => {
  const { update, repeats } = input;
  if (update.canonicalOutcomeSummary.outcome === 'blocked' && repeats >= 2) {
    return {
      action: 'adjust-plan-for-blocked-outcome',
      recommendedPlanTarget: `plan.tasks.interop.${update.action}.unblock`,
      reasonCode: 'repeated-blocked-runtime-outcome',
      confidence: {
        score: 0.77,
        rationale: 'Repeated blocked receipts are deterministic evidence that the current bounded plan needs an explicit unblock step.'
      },
      nextActionText: `Add a bounded unblock step for ${update.action} before re-emitting request ${update.requestId}.`
    };
  }

  if (update.canonicalOutcomeSummary.outcome === 'failed' && repeats >= 2) {
    return {
      action: 'add-bounded-retry-or-recovery-step',
      recommendedPlanTarget: `plan.tasks.interop.${update.action}.retry-recovery`,
      reasonCode: 'repeated-failed-runtime-outcome',
      confidence: {
        score: 0.79,
        rationale: 'Repeated failed receipts indicate a deterministic retry/recovery need that should be reflected as an explicit bounded plan step.'
      },
      nextActionText: `Propose bounded retry or recovery planning for ${update.action} after repeated failed outcomes.`
    };
  }

  const hasCompletedStateAdvance =
    update.canonicalOutcomeSummary.outcome === 'completed'
    && update.boundedStateDelta.requestState === 'completed'
    && (
      update.action === 'revise_weekly_goal_plan'
      || (update.boundedStateDelta.outputArtifactPath !== null && update.nextActionHints.length > 0)
    );

  if (hasCompletedStateAdvance) {
    return {
      action: 'promote-next-approved-planning-step',
      recommendedPlanTarget: `plan.tasks.interop.${update.action}.next-approved-step`,
      reasonCode: 'completed-bounded-state-advance',
      confidence: {
        score: 0.86,
        rationale: 'Completed bounded state changes can deterministically seed the next approved planning step without mutating plan state.'
      },
      nextActionText: `Use completed receipt ${update.receiptId} to propose the next approved planning step for ${update.action}.`
    };
  }

  return null;
};

const getPlanFollowupByReceipt = (followups: InteropFollowupsArtifact): Map<string, InteropFollowupRow> => {
  const nextPlanFollowups = [...followups.followups]
    .filter((entry) => entry.followupType === 'next-plan-hint' && entry.action === 'queue-next-plan-hint')
    .sort((a, b) => a.followupId.localeCompare(b.followupId));
  const map = new Map<string, InteropFollowupRow>();
  for (const followup of nextPlanFollowups) {
    if (!map.has(followup.source.receiptId)) {
      map.set(followup.source.receiptId, followup);
    }
  }
  return map;
};

export const compileInteropPlanHints = (
  cwd: string,
  options?: { followupsPath?: string; updatedTruthPath?: string; artifactPath?: string }
): { artifactPath: string; planHints: InteropPlanHintsArtifact } => {
  const followupsPath = options?.followupsPath ?? INTEROP_FOLLOWUPS_DEFAULT_FILE;
  const updatedTruthPath = options?.updatedTruthPath ?? INTEROP_UPDATED_TRUTH_DEFAULT_FILE;
  const artifactPath = options?.artifactPath ?? INTEROP_PLAN_HINTS_DEFAULT_FILE;

  if (followupsPath !== INTEROP_FOLLOWUPS_DEFAULT_FILE) {
    throw new Error('Cannot compile interop plan hints: only canonical followups artifact path is supported.');
  }
  if (updatedTruthPath !== INTEROP_UPDATED_TRUTH_DEFAULT_FILE) {
    throw new Error('Cannot compile interop plan hints: only canonical updated truth artifact path is supported.');
  }
  if (artifactPath !== INTEROP_PLAN_HINTS_DEFAULT_FILE) {
    throw new Error('Cannot compile interop plan hints: only canonical plan hints artifact path is supported.');
  }

  const absFollowups = path.resolve(cwd, followupsPath);
  const absUpdatedTruth = path.resolve(cwd, updatedTruthPath);
  if (!fs.existsSync(absFollowups)) {
    throw new Error(`Cannot compile interop plan hints: required artifact not found at ${followupsPath}.`);
  }
  if (!fs.existsSync(absUpdatedTruth)) {
    throw new Error(`Cannot compile interop plan hints: required artifact not found at ${updatedTruthPath}.`);
  }

  const followups = parseFollowups(fs.readFileSync(absFollowups, 'utf8'));
  const updatedTruth = parseUpdatedTruth(fs.readFileSync(absUpdatedTruth, 'utf8'));
  const followupByReceipt = getPlanFollowupByReceipt(followups);

  const repeatsByActionOutcome = new Map<string, number>();
  for (const update of updatedTruth.updates) {
    const key = `${update.action}:${update.canonicalOutcomeSummary.outcome}`;
    repeatsByActionOutcome.set(key, (repeatsByActionOutcome.get(key) ?? 0) + 1);
  }

  const hints: InteropPlanHintRow[] = [];
  for (const update of [...updatedTruth.updates].sort((a, b) => a.receiptId.localeCompare(b.receiptId))) {
    const followup = followupByReceipt.get(update.receiptId);
    if (!followup) continue;
    const repeats = repeatsByActionOutcome.get(`${update.action}:${update.canonicalOutcomeSummary.outcome}`) ?? 0;
    const decision = buildHintDecision({ update, repeats });
    if (!decision) continue;

    hints.push({
      hintId: `next-plan-hint-${update.receiptId}`,
      requestId: update.requestId,
      receiptId: update.receiptId,
      action: decision.action,
      receiptType: update.receiptType,
      canonicalOutcomeSummary: update.canonicalOutcomeSummary,
      recommendedPlanTarget: decision.recommendedPlanTarget,
      reasonCode: decision.reasonCode,
      confidence: decision.confidence,
      provenanceRefs: uniqueSorted([
        INTEROP_FOLLOWUPS_DEFAULT_FILE,
        INTEROP_UPDATED_TRUTH_DEFAULT_FILE,
        ...followup.provenanceRefs,
        `followup:${followup.followupId}`
      ]),
      nextActionText: decision.nextActionText
    });
  }

  const planHints: InteropPlanHintsArtifact = {
    schemaVersion: INTEROP_PLAN_HINTS_SCHEMA_VERSION,
    kind: 'interop-plan-hints-artifact',
    command: 'interop plan-hints',
    reviewOnly: true,
    proposalOnly: true,
    authority: {
      mutation: 'read-only',
      promotion: 'review-required'
    },
    sourceArtifacts: {
      followupsPath: INTEROP_FOLLOWUPS_DEFAULT_FILE,
      updatedTruthPath: INTEROP_UPDATED_TRUTH_DEFAULT_FILE,
      contractSourceHash: updatedTruth.contract.sourceHash,
      contractSourceRef: updatedTruth.contract.sourceRef,
      contractSourcePath: updatedTruth.contract.sourcePath
    },
    hints: hints.sort((a, b) => a.hintId.localeCompare(b.hintId))
  };

  const absArtifactPath = path.resolve(cwd, artifactPath);
  fs.mkdirSync(path.dirname(absArtifactPath), { recursive: true });
  fs.writeFileSync(absArtifactPath, deterministicStringify(planHints), 'utf8');

  return { artifactPath, planHints };
};
