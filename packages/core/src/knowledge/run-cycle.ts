export type RunCyclePhaseOutputs = {
  execution: {
    observe: string[];
    verify: string[];
    plan: string[];
    apply: string[];
  };
  intelligence: {
    extract: string[];
    canonicalize: string[];
    compact: string[];
  };
  governance: {
    promote: string[];
    retire: string[];
  };
};

export type RunCycleMetrics = {
  durationMs: number | null;
  phaseDurationsMs: {
    observe: number | null;
    verify: number | null;
    plan: number | null;
    apply: number | null;
    extract: number | null;
    canonicalize: number | null;
    compact: number | null;
    promote: number | null;
    retire: number | null;
  };
  findingsCount: number;
  compactedDeltaCount: number;
  promotedCount: number;
  retiredCount: number;
};

export type RunCycle = {
  id: string;
  goal: string;
  inputContextSnapshotId: string;
  constraints: string[];
  contracts: string[];
  phaseOutputs: RunCyclePhaseOutputs;
  evidenceRefs: string[];
  extractedFindings: string[];
  compactedDeltas: string[];
  promotedPatternIds: string[];
  retiredPatternIds: string[];
  nextContextDelta: string[];
  metrics: RunCycleMetrics;
};

export const createEmptyRunCycle = (args: {
  id: string;
  goal: string;
  inputContextSnapshotId: string;
  constraints?: string[];
  contracts?: string[];
}): RunCycle => ({
  id: args.id,
  goal: args.goal,
  inputContextSnapshotId: args.inputContextSnapshotId,
  constraints: [...(args.constraints ?? [])],
  contracts: [...(args.contracts ?? [])],
  phaseOutputs: {
    execution: { observe: [], verify: [], plan: [], apply: [] },
    intelligence: { extract: [], canonicalize: [], compact: [] },
    governance: { promote: [], retire: [] }
  },
  evidenceRefs: [],
  extractedFindings: [],
  compactedDeltas: [],
  promotedPatternIds: [],
  retiredPatternIds: [],
  nextContextDelta: [],
  metrics: {
    durationMs: null,
    phaseDurationsMs: {
      observe: null,
      verify: null,
      plan: null,
      apply: null,
      extract: null,
      canonicalize: null,
      compact: null,
      promote: null,
      retire: null
    },
    findingsCount: 0,
    compactedDeltaCount: 0,
    promotedCount: 0,
    retiredCount: 0
  }
});
