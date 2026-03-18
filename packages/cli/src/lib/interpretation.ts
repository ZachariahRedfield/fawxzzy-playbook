import type {
  FleetAdoptionReadinessSummary,
  FleetAdoptionWorkQueue,
  FleetCodexExecutionPlan,
  FleetExecutionReceipt,
  FleetUpdatedAdoptionState,
  RepoAdoptionReadiness
} from '@zachariahredfield/playbook-engine';

export type InterpretationAction = {
  label: string;
  command?: string;
  priority: 'primary' | 'secondary';
};

export type InterpretationView = {
  state: string;
  why: string;
  next_step: InterpretationAction;
};

export type InterpretationLayer = {
  pattern: 'interpretation-layer';
  progressive_disclosure: {
    default_view: InterpretationView;
    secondary_view: {
      blockers: string[];
      reasoning: string[];
      secondary_actions: InterpretationAction[];
    };
    deep_view: {
      raw_truth_refs: string[];
      artifact_paths: string[];
      diagnostics: string[];
      promotion_metadata_refs: string[];
    };
  };
};

const action = (label: string, command: string | undefined, priority: 'primary' | 'secondary'): InterpretationAction => ({ label, command, priority });

const unique = (values: string[]): string[] => Array.from(new Set(values.filter((value) => value.trim().length > 0)));

export const buildRepoStatusInterpretation = (input: {
  ok: boolean;
  adoption: RepoAdoptionReadiness;
  topIssueDescription?: string | null;
  topIssueId?: string | null;
}): InterpretationLayer => {
  const primaryCommand = input.adoption.recommended_next_steps[0]
    ?? (input.topIssueId ? `pnpm playbook explain ${input.topIssueId}` : undefined)
    ?? 'No action required.';
  const blockers = input.adoption.blockers.map((blocker: RepoAdoptionReadiness['blockers'][number]) => `${blocker.code}: ${blocker.message}`);
  const reasoning = unique([
    `Lifecycle stage: ${input.adoption.lifecycle_stage}.`,
    `Playbook detected: ${input.adoption.playbook_detected ? 'yes' : 'no'}.`,
    `Verification-ready state: ${input.ok ? 'healthy' : 'attention required'}.`,
    input.topIssueDescription ? `Top issue: ${input.topIssueDescription}.` : ''
  ]);

  return {
    pattern: 'interpretation-layer',
    progressive_disclosure: {
      default_view: {
        state: input.ok && input.adoption.lifecycle_stage === 'ready' ? 'ready' : input.adoption.lifecycle_stage,
        why: blockers[0] ?? input.topIssueDescription ?? 'Governed status checks are healthy.',
        next_step: action(
          primaryCommand === 'No action required.' ? 'No action required' : 'Primary next action',
          primaryCommand === 'No action required.' ? undefined : primaryCommand,
          'primary'
        )
      },
      secondary_view: {
        blockers,
        reasoning,
        secondary_actions: input.adoption.recommended_next_steps.slice(1).map((command: string) => action('Secondary next action', command, 'secondary'))
      },
      deep_view: {
        raw_truth_refs: ['summary', 'analysis', 'verification', 'adoption'],
        artifact_paths: ['.playbook/repo-index.json', '.playbook/repo-graph.json', '.playbook/plan.json', '.playbook/policy-apply-result.json'],
        diagnostics: unique([
          `Fallback proof ready: ${input.adoption.fallback_proof_ready ? 'yes' : 'no'}.`,
          `Cross-repo eligible: ${input.adoption.cross_repo_eligible ? 'yes' : 'no'}.`
        ]),
        promotion_metadata_refs: []
      }
    }
  };
};

export const buildFleetInterpretation = (fleet: FleetAdoptionReadinessSummary): InterpretationLayer => {
  const primary = fleet.recommended_actions[0];
  return {
    pattern: 'interpretation-layer',
    progressive_disclosure: {
      default_view: {
        state: `${fleet.total_repos} repos observed`,
        why: primary ? `${primary.count} repo(s) share the highest-priority action.` : 'No fleet action is currently required.',
        next_step: action(primary ? 'Primary next action' : 'No action required', primary?.command, 'primary')
      },
      secondary_view: {
        blockers: (fleet.blocker_frequencies || []).slice(0, 5).map((entry: FleetAdoptionReadinessSummary['blocker_frequencies'][number]) => `${entry.blocker_code}: ${entry.count}`),
        reasoning: unique([
          `Ready repos: ${fleet.by_lifecycle_stage.ready}.`,
          `Cross-repo eligible repos: ${fleet.cross_repo_eligible_count}.`,
          `Fallback-proof ready repos: ${fleet.fallback_proof_ready_count}.`
        ]),
        secondary_actions: (fleet.recommended_actions || []).slice(1, 3).map((entry: FleetAdoptionReadinessSummary['recommended_actions'][number]) => action('Secondary action', entry.command, 'secondary'))
      },
      deep_view: {
        raw_truth_refs: ['fleet.total_repos', 'fleet.by_lifecycle_stage', 'fleet.blocker_frequencies', 'fleet.recommended_actions', 'fleet.repos_by_priority'],
        artifact_paths: ['.playbook/observer/repos.json'],
        diagnostics: [],
        promotion_metadata_refs: []
      }
    }
  };
};

export const buildQueueInterpretation = (queue: FleetAdoptionWorkQueue): InterpretationLayer => {
  const firstItem = queue.work_items[0];
  return {
    pattern: 'interpretation-layer',
    progressive_disclosure: {
      default_view: {
        state: `${queue.work_items.length} actionable queue item(s)`,
        why: firstItem ? `${firstItem.repo_id} is first because ${firstItem.rationale}.` : 'No actionable work items remain.',
        next_step: action(firstItem ? 'Primary next action' : 'No action required', firstItem?.recommended_command, 'primary')
      },
      secondary_view: {
        blockers: (queue.blocked_items || []).slice(0, 5).map((item: FleetAdoptionWorkQueue['blocked_items'][number]) => `${item.repo_id}: ${item.unmet_dependencies.join(', ')}`),
        reasoning: unique([
          `Queue source: ${queue.queue_source || 'readiness'}.`,
          `Wave count: ${Array.isArray(queue.waves) ? queue.waves.length : 0}.`,
          `Grouped action lanes: ${Array.isArray(queue.grouped_actions) ? queue.grouped_actions.length : 0}.`
        ]),
        secondary_actions: (queue.work_items || []).slice(1, 3).map((item: FleetAdoptionWorkQueue['work_items'][number]) => action(`Next for ${item.repo_id}`, item.recommended_command, 'secondary'))
      },
      deep_view: {
        raw_truth_refs: ['queue.work_items', 'queue.waves', 'queue.grouped_actions', 'queue.blocked_items'],
        artifact_paths: ['.playbook/execution-updated-state.json'],
        diagnostics: [],
        promotion_metadata_refs: []
      }
    }
  };
};

export const buildExecutionPlanInterpretation = (plan: FleetCodexExecutionPlan): InterpretationLayer => ({
  pattern: 'interpretation-layer',
  progressive_disclosure: {
    default_view: {
      state: `${plan.codex_prompts.length} Codex prompt(s) packaged`,
      why: plan.worker_lanes.length > 0 ? `${plan.worker_lanes[0].lane_id} is the first worker lane in deterministic order.` : 'No worker lanes are currently available.',
      next_step: action(plan.codex_prompts[0] ? 'Primary next action' : 'No action required', plan.codex_prompts[0]?.prompt_id, 'primary')
    },
    secondary_view: {
      blockers: (plan.blocked_followups || []).slice(0, 5).map((item: FleetCodexExecutionPlan['blocked_followups'][number]) => String(item)),
      reasoning: unique([
        `Wave count: ${plan.waves.length}.`,
        `Worker lanes: ${plan.worker_lanes.length}.`,
        `Execution notes: ${plan.execution_notes.length}.`
      ]),
      secondary_actions: (plan.codex_prompts || []).slice(1, 3).map((prompt: FleetCodexExecutionPlan['codex_prompts'][number]) => action(`Prompt ${prompt.prompt_id}`, prompt.prompt_id, 'secondary'))
    },
    deep_view: {
      raw_truth_refs: ['execution_plan.waves', 'execution_plan.worker_lanes', 'execution_plan.codex_prompts', 'execution_plan.blocked_followups'],
      artifact_paths: ['.playbook/execution-plan.json'],
      diagnostics: [],
      promotion_metadata_refs: []
    }
  }
});

export const buildReceiptInterpretation = (receipt: FleetExecutionReceipt): InterpretationLayer => ({
  pattern: 'interpretation-layer',
  progressive_disclosure: {
    default_view: {
      state: `${receipt.verification_summary.succeeded_count} succeeded / ${receipt.verification_summary.failed_count + receipt.verification_summary.mismatch_count} failed-or-drifted`,
      why: receipt.verification_summary.repos_needing_retry.length > 0 ? 'At least one repo still needs retry based on governed evidence.' : 'No retry candidates are currently surfaced.',
      next_step: action(
        receipt.verification_summary.repos_needing_retry[0] ? 'Primary next action' : 'No action required',
        receipt.verification_summary.repos_needing_retry[0],
        'primary'
      )
    },
    secondary_view: {
      blockers: (receipt.blockers || []).slice(0, 5).map((blocker: FleetExecutionReceipt['blockers'][number]) => JSON.stringify(blocker)),
      reasoning: unique([
        `Prompts total: ${receipt.verification_summary.prompts_total}.`,
        `Partial count: ${receipt.verification_summary.partial_count}.`,
        `Planned-vs-actual drift count: ${receipt.verification_summary.mismatch_count}.`
      ]),
      secondary_actions: []
    },
    deep_view: {
      raw_truth_refs: ['receipt.wave_results', 'receipt.prompt_results', 'receipt.repo_results', 'receipt.artifact_deltas', 'receipt.verification_summary'],
      artifact_paths: ['.playbook/execution-outcome-input.json'],
      diagnostics: [],
      promotion_metadata_refs: ['receipt.workflow_promotion']
    }
  }
});

export const buildUpdatedStateInterpretation = (updatedState: FleetUpdatedAdoptionState, nextQueue: FleetAdoptionWorkQueue, promotionStatus?: string): InterpretationLayer => ({
  pattern: 'interpretation-layer',
  progressive_disclosure: {
    default_view: {
      state: `${updatedState.summary.repos_total} repo reconciliation result(s)`,
      why: updatedState.summary.repos_needing_retry.length > 0 ? 'Updated state shows retry work that should be re-queued.' : 'Updated state does not require retry follow-up.',
      next_step: action(nextQueue.work_items[0] ? 'Primary next action' : 'No action required', nextQueue.work_items[0]?.recommended_command, 'primary')
    },
    secondary_view: {
      blockers: unique([
        `Needs retry: ${updatedState.summary.repos_needing_retry.join(', ') || 'none'}`,
        `Needs replan: ${updatedState.summary.repos_needing_replan.join(', ') || 'none'}`,
        `Needs review: ${updatedState.summary.repos_needing_review.join(', ') || 'none'}`
      ]),
      reasoning: unique([
        `Promotion status: ${promotionStatus || 'unknown'}.`,
        `Next queue items: ${nextQueue.work_items.length}.`
      ]),
      secondary_actions: nextQueue.work_items.slice(1, 3).map((item: FleetAdoptionWorkQueue['work_items'][number]) => action(`Next for ${item.repo_id}`, item.recommended_command, 'secondary'))
    },
    deep_view: {
      raw_truth_refs: ['updated_state.summary', 'updated_state.repos', 'next_queue.work_items'],
      artifact_paths: ['.playbook/execution-updated-state.json', '.playbook/staged/workflow-status-updated/execution-updated-state.json'],
      diagnostics: [],
      promotion_metadata_refs: ['promotion']
    }
  }
});

export const buildProofInterpretation = (proof: {
  current_state: string;
  highest_priority_next_action: string;
  summary: { why: string };
  diagnostics: { failing_stage: string | null; failing_category: string | null; checks?: unknown[] };
}): InterpretationLayer => ({
  pattern: 'interpretation-layer',
  progressive_disclosure: {
    default_view: {
      state: proof.current_state,
      why: proof.summary.why,
      next_step: action('Primary next action', proof.highest_priority_next_action, 'primary')
    },
    secondary_view: {
      blockers: unique([
        proof.diagnostics.failing_stage ? `Failing stage: ${proof.diagnostics.failing_stage}` : '',
        proof.diagnostics.failing_category ? `Failing category: ${proof.diagnostics.failing_category}` : ''
      ]),
      reasoning: ['Bootstrap proof summary is derived directly from governed proof diagnostics.'],
      secondary_actions: []
    },
    deep_view: {
      raw_truth_refs: ['proof.summary', 'proof.diagnostics', 'proof.current_state', 'proof.highest_priority_next_action'],
      artifact_paths: [],
      diagnostics: [`Checks inspected: ${Array.isArray(proof.diagnostics.checks) ? proof.diagnostics.checks.length : 0}.`],
      promotion_metadata_refs: []
    }
  }
});

export const buildRouteInterpretation = (input: {
  task: string;
  selectedRoute: string;
  why: string;
  requiredInputs: string[];
  executionPlan: {
    required_validations: string[];
    missing_prerequisites: string[];
    warnings: string[];
    open_questions: string[];
    route_id: string;
  };
  promotion: { candidate_artifact_path?: string; committed_target_path?: string };
}): InterpretationLayer => {
  const primaryCommand = input.selectedRoute === 'unsupported'
    ? (input.executionPlan.missing_prerequisites[0] || 'Clarify prerequisites and retry.')
    : (input.executionPlan.required_validations[0] || 'Review .playbook/execution-plan.json');

  return {
    pattern: 'interpretation-layer',
    progressive_disclosure: {
      default_view: {
        state: input.selectedRoute,
        why: input.why,
        next_step: action('Primary next action', primaryCommand, 'primary')
      },
      secondary_view: {
        blockers: input.executionPlan.missing_prerequisites,
        reasoning: unique([
          `Task: ${input.task}.`,
          `Route id: ${input.executionPlan.route_id}.`,
          `Required inputs: ${input.requiredInputs.join(', ')}.`
        ]),
        secondary_actions: input.executionPlan.required_validations.slice(1, 3).map((command) => action('Secondary validation', command, 'secondary'))
      },
      deep_view: {
        raw_truth_refs: ['task', 'selectedRoute', 'why', 'requiredInputs', 'executionPlan'],
        artifact_paths: unique([input.promotion.candidate_artifact_path || '', input.promotion.committed_target_path || '', '.playbook/execution-plan.json']),
        diagnostics: [...input.executionPlan.warnings, ...input.executionPlan.open_questions],
        promotion_metadata_refs: ['promotion']
      }
    }
  };
};
