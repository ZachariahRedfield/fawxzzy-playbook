import fs from "node:fs";
import path from "node:path";
import {
  buildFleetAdoptionReadinessSummary,
  buildFleetAdoptionWorkQueue,
  buildFleetCodexExecutionPlan,
  ingestExecutionResults,
  type ExecutionResult,
  buildRepoAdoptionReadiness,
} from "@zachariahredfield/playbook-engine";
import { writeJsonArtifactAbsolute } from "../../lib/jsonArtifact.js";
import {
  previewWorkflowArtifact,
  stageWorkflowArtifact,
} from "../../lib/workflowPromotion.js";
import type { WorkflowPromotion } from "../../lib/workflowPromotion.js";

export const EXECUTION_OUTCOME_INPUT_RELATIVE_PATH = path.join(
  ".playbook",
  "execution-outcome-input.json",
);
export const UPDATED_STATE_RELATIVE_PATH = path.join(
  ".playbook",
  "execution-updated-state.json",
);
export const UPDATED_STATE_STAGING_RELATIVE_PATH = path.join(
  ".playbook",
  "staged",
  "workflow-status-updated",
  "execution-updated-state.json",
);

type ObserverRegistry = {
  repos: Array<{ id: string; name: string; root: string }>;
};

export type PersistedExecutionIngest = ReturnType<typeof ingestExecutionResults> & {
  receipt_with_promotion: ReturnType<typeof ingestExecutionResults>["receipt"] & {
    workflow_promotion: WorkflowPromotion;
  };
  promotion: WorkflowPromotion;
  written_artifacts: {
    execution_outcome_input: string;
    updated_state: string;
    staged_updated_state: string;
  };
};

export const loadFleet = (cwd: string) => {
  const registryPath = path.join(cwd, ".playbook", "observer", "repos.json");
  const registry = fs.existsSync(registryPath)
    ? (JSON.parse(fs.readFileSync(registryPath, "utf8")) as ObserverRegistry)
    : { repos: [{ id: "current-repo", name: path.basename(cwd), root: cwd }] };
  const repos = Array.isArray(registry.repos) ? registry.repos : [];
  return buildFleetAdoptionReadinessSummary(
    repos.map((repo) => ({
      repo_id: repo.id,
      repo_name: repo.name,
      readiness: buildRepoAdoptionReadiness({
        repoRoot: repo.root,
        connected: true,
      }),
    })),
  );
};

export const parseExecutionResults = (raw: string): ExecutionResult[] => {
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed))
    throw new Error("execution results input must be a JSON array");
  return parsed.map((entry, index) => {
    if (!entry || typeof entry !== "object")
      throw new Error(`execution result at index ${index} must be an object`);
    const value = entry as Record<string, unknown>;
    if (typeof value.repo_id !== "string" || value.repo_id.length === 0)
      throw new Error(`execution result at index ${index} is missing repo_id`);
    if (typeof value.prompt_id !== "string" || value.prompt_id.length === 0)
      throw new Error(
        `execution result at index ${index} is missing prompt_id`,
      );
    if (
      value.status !== "success" &&
      value.status !== "failed" &&
      value.status !== "not_run"
    )
      throw new Error(
        `execution result at index ${index} has unsupported status`,
      );
    if (value.observed_transition !== undefined) {
      const transition = value.observed_transition as Record<string, unknown>;
      if (
        !transition ||
        typeof transition !== "object" ||
        typeof transition.from !== "string" ||
        typeof transition.to !== "string"
      ) {
        throw new Error(
          `execution result at index ${index} has invalid observed_transition`,
        );
      }
    }
    return {
      repo_id: value.repo_id,
      prompt_id: value.prompt_id,
      status: value.status,
      observed_transition: value.observed_transition as
        | ExecutionResult["observed_transition"]
        | undefined,
      error: typeof value.error === "string" ? value.error : undefined,
    };
  });
};

export const validateUpdatedStateArtifact = (
  updatedState: ReturnType<typeof ingestExecutionResults>["updated_state"],
  nextQueue: ReturnType<typeof ingestExecutionResults>["next_queue"],
): string[] => {
  const errors: string[] = [];
  if (updatedState.schemaVersion !== "1.0")
    errors.push("schemaVersion must be 1.0");
  if (updatedState.kind !== "fleet-adoption-updated-state")
    errors.push("kind must be fleet-adoption-updated-state");
  if (!Array.isArray(updatedState.repos)) errors.push("repos must be an array");
  if (!updatedState.summary || typeof updatedState.summary !== "object")
    errors.push("summary must be present");
  if (nextQueue.queue_source !== "updated_state")
    errors.push("next queue must be derived from updated_state");
  if (
    Array.isArray(updatedState.repos) &&
    updatedState.summary?.repos_total !== updatedState.repos.length
  )
    errors.push("summary.repos_total must match repos length");
  return errors;
};

export const buildExecutionControlLoop = (
  cwd: string,
  executionResults: ExecutionResult[],
  options?: { generatedAt?: string; sessionId?: string },
) => {
  const fleet = loadFleet(cwd);
  const queue = buildFleetAdoptionWorkQueue(fleet);
  const executionPlan = buildFleetCodexExecutionPlan(queue);
  return ingestExecutionResults(
    fleet,
    queue,
    executionPlan,
    executionResults,
    options,
  );
};

export const persistExecutionControlLoop = (
  cwd: string,
  executionResults: ExecutionResult[],
  options?: { generatedAt?: string; sessionId?: string },
): PersistedExecutionIngest => {
  const ingested = buildExecutionControlLoop(cwd, executionResults, options);

  const outcomePath = path.join(cwd, EXECUTION_OUTCOME_INPUT_RELATIVE_PATH);
  writeJsonArtifactAbsolute(
    outcomePath,
    ingested.execution_outcome_input as unknown as Record<string, unknown>,
    "receipt",
    { envelope: false },
  );

  const promotionPreview = previewWorkflowArtifact({
    cwd,
    workflowKind: "status-updated",
    candidateRelativePath: UPDATED_STATE_STAGING_RELATIVE_PATH,
    committedRelativePath: UPDATED_STATE_RELATIVE_PATH,
    artifact: ingested.updated_state,
    validate: () =>
      validateUpdatedStateArtifact(ingested.updated_state, ingested.next_queue),
    generatedAt: ingested.updated_state.generated_at,
    successSummary:
      "Staged updated-state candidate validated and ready for promotion into committed adoption state.",
    blockedSummary:
      "Staged updated-state candidate blocked; committed adoption state preserved.",
  });
  const receiptWithPromotion = {
    ...ingested.receipt,
    workflow_promotion: promotionPreview,
  };
  const promotion = stageWorkflowArtifact({
    cwd,
    workflowKind: "status-updated",
    candidateRelativePath: UPDATED_STATE_STAGING_RELATIVE_PATH,
    committedRelativePath: UPDATED_STATE_RELATIVE_PATH,
    artifact: ingested.updated_state,
    validate: () =>
      validateUpdatedStateArtifact(ingested.updated_state, ingested.next_queue),
    generatedAt: ingested.updated_state.generated_at,
    successSummary:
      "Staged updated-state candidate validated and promoted into committed adoption state.",
    blockedSummary:
      "Staged updated-state candidate blocked; committed adoption state preserved.",
  });

  return {
    ...ingested,
    receipt_with_promotion: receiptWithPromotion,
    promotion,
    written_artifacts: {
      execution_outcome_input: EXECUTION_OUTCOME_INPUT_RELATIVE_PATH,
      updated_state: UPDATED_STATE_RELATIVE_PATH,
      staged_updated_state: UPDATED_STATE_STAGING_RELATIVE_PATH,
    },
  };
};
