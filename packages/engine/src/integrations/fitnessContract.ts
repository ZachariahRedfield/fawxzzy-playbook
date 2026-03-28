/**
 * Source of truth:
 * - fawxzzy-fitness/src/lib/ecosystem/contract-types.ts
 * - fawxzzy-fitness/src/lib/ecosystem/fitness-integration-contract.ts
 *
 * Sync boundary:
 * - Playbook and Fitness live in separate repositories, so this file mirrors the Fitness-owned contract shape exactly.
 *
 * Rule:
 * - Do not rename fields, widen enums, or reinterpret semantics here.
 */

export const fitnessIntegrationContract = {
  schemaVersion: '1.0',
  kind: 'fitness-integration-contract',
  governance: {
    loop: 'signal->plan->action->receipt',
    seam: 'playbook-lifeline',
    bypassAllowed: false
  },
  signalTypes: [
    'fitness.session.events',
    'fitness.recovery.events',
    'fitness.goal.events'
  ],
  stateSnapshotTypes: [
    'fitness.session.snapshot',
    'fitness.recovery.snapshot',
    'fitness.goal.snapshot'
  ],
  actions: [
    {
      name: 'adjust_upcoming_workout_load',
      receiptType: 'schedule_adjustment_applied',
      routing: {
        topic: 'fitness.actions.training-load',
        must_route_through_playbook_plan: true,
        no_direct_lifeline_bypass: true
      },
      constraints: ['same_week_only', 'max_duration_days_14'],
      input: {
        fields: [
          { name: 'athlete_id', type: 'string', required: true },
          { name: 'week_id', type: 'string', required: true },
          { name: 'workout_id', type: 'string', required: true },
          { name: 'load_adjustment_percent', type: 'number', required: true, min: -40, max: 40 },
          { name: 'duration_days', type: 'number', required: true, min: 1, max: 14 },
          {
            name: 'reason_code',
            type: 'string',
            required: true,
            allowedValues: ['fatigue_spike', 'session_missed', 'readiness_drop']
          }
        ]
      }
    },
    {
      name: 'schedule_recovery_block',
      receiptType: 'recovery_guardrail_applied',
      routing: {
        topic: 'fitness.actions.recovery',
        must_route_through_playbook_plan: true,
        no_direct_lifeline_bypass: true
      },
      constraints: ['same_week_only', 'max_duration_days_14'],
      input: {
        fields: [
          { name: 'athlete_id', type: 'string', required: true },
          { name: 'week_id', type: 'string', required: true },
          { name: 'start_date', type: 'string', required: true },
          { name: 'duration_days', type: 'number', required: true, min: 1, max: 14 },
          {
            name: 'recovery_mode',
            type: 'string',
            required: true,
            allowedValues: ['rest', 'deload', 'active_recovery']
          }
        ]
      }
    },
    {
      name: 'revise_weekly_goal_plan',
      receiptType: 'goal_plan_amended',
      routing: {
        topic: 'fitness.actions.weekly-plan',
        must_route_through_playbook_plan: true,
        no_direct_lifeline_bypass: true
      },
      constraints: ['same_week_only', 'max_duration_days_14'],
      input: {
        fields: [
          { name: 'athlete_id', type: 'string', required: true },
          { name: 'week_id', type: 'string', required: true },
          {
            name: 'goal_domain',
            type: 'string',
            required: true,
            allowedValues: ['volume', 'intensity', 'consistency']
          },
          { name: 'target_value', type: 'number', required: true, min: 0, max: 1000 },
          { name: 'duration_days', type: 'number', required: true, min: 1, max: 14 }
        ]
      }
    }
  ],
  receiptTypes: [
    'schedule_adjustment_applied',
    'recovery_guardrail_applied',
    'goal_plan_amended'
  ]
} as const;

export type FitnessIntegrationContract = typeof fitnessIntegrationContract;
export type FitnessActionName = FitnessIntegrationContract['actions'][number]['name'];
export type FitnessReceiptType = FitnessIntegrationContract['actions'][number]['receiptType'];

const actionByName = new Map(
  fitnessIntegrationContract.actions.map((action) => [action.name, action])
);

export const isFitnessActionName = (value: string): value is FitnessActionName => actionByName.has(value as FitnessActionName);

export const getFitnessActionContract = (actionName: FitnessActionName) => actionByName.get(actionName)!;

export const getFitnessReceiptTypeForAction = (actionName: FitnessActionName): FitnessReceiptType =>
  getFitnessActionContract(actionName).receiptType;
