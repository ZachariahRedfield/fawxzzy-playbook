export type ExecutionTaskFamily = 'docs_only' | 'contracts_schema' | 'cli_command' | 'engine_scoring' | 'pattern_learning';

export type ExecutionSurface = 'docs' | 'contracts' | 'schemas' | 'cli' | 'engine' | 'knowledge' | 'tests' | 'governance';

export type ExecutionScope = 'single-file' | 'single-module' | 'multi-module' | 'cross-repo';

export type EstimatedChangeSurface = 'small' | 'medium' | 'large';

export type TaskExecutionProfileInput = {
  changedFiles: string[];
  affectedPackages: string[];
  taskFamily?: ExecutionTaskFamily;
  declaredSurfaces?: ExecutionSurface[];
  generatedAt?: string;
};

export type TaskExecutionProfileProposal = {
  task_family: ExecutionTaskFamily;
  scope: ExecutionScope;
  affected_surfaces: ExecutionSurface[];
  rule_packs: string[];
  required_validations: string[];
  optional_validations: string[];
  docs_requirements: string[];
  parallel_safe: boolean;
  estimated_change_surface: EstimatedChangeSurface;
};

export type TaskExecutionProfileArtifact = {
  schemaVersion: '1.0';
  kind: 'task-execution-profile';
  generatedAt: string;
  proposalOnly: true;
  profiles: TaskExecutionProfileProposal[];
};

export type ExecutionPlanRouteStatus = 'resolved' | 'incomplete';

export type TaskExecutionPlan = {
  schemaVersion: '1.0';
  kind: 'task-execution-plan';
  task: string;
  route_status: ExecutionPlanRouteStatus;
  task_family: ExecutionTaskFamily | 'unsupported';
  route_id: string;
  affected_surfaces: ExecutionSurface[];
  estimated_change_surface: EstimatedChangeSurface;
  rule_packs: string[];
  required_validations: string[];
  optional_validations: string[];
  parallel_lanes: number;
  mutation_allowed: false;
  warnings: string[];
  missing_prerequisites: string[];
};

const FAMILY_ORDER: ExecutionTaskFamily[] = ['docs_only', 'contracts_schema', 'cli_command', 'engine_scoring', 'pattern_learning'];

const FAMILY_KEYWORDS: Record<ExecutionTaskFamily, readonly string[]> = {
  docs_only: ['doc', 'docs', 'readme', 'changelog', 'markdown', 'guide'],
  contracts_schema: ['contract', 'schema', 'json schema', 'spec', 'registry'],
  cli_command: ['command', 'cli', 'flag', 'subcommand', 'route command'],
  engine_scoring: ['engine scoring', 'scoring', 'score', 'ranking', 'fitness'],
  pattern_learning: ['pattern learning', 'pattern', 'knowledge graph', 'doctrine', 'learning']
};

const sortUnique = <T extends string>(values: readonly T[]): T[] => [...new Set(values)].sort((a, b) => a.localeCompare(b));

const inferScope = (changedFiles: string[], affectedPackages: string[]): ExecutionScope => {
  const packageCount = new Set(affectedPackages).size;
  if (packageCount > 1) {
    return 'multi-module';
  }

  if (changedFiles.length <= 1) {
    return 'single-file';
  }

  return 'single-module';
};

const inferFamiliesFromFiles = (changedFiles: string[]): ExecutionTaskFamily[] => {
  if (changedFiles.length === 0) {
    return [];
  }

  const normalized = changedFiles.map((file) => file.replace(/\\/g, '/'));
  const isDocsFile = (file: string): boolean => file.endsWith('.md') || file.startsWith('docs/');
  const touchesDocsOnly = normalized.every((file) => isDocsFile(file));

  const detected: ExecutionTaskFamily[] = [];

  if (touchesDocsOnly) {
    detected.push('docs_only');
  }

  if (normalized.some((file) => file.startsWith('packages/contracts/') || file.includes('/schema') || file.endsWith('.schema.json'))) {
    detected.push('contracts_schema');
  }

  if (normalized.some((file) => file.startsWith('packages/cli/src/commands/') || file === 'docs/commands/README.md' || file.startsWith('docs/commands/'))) {
    detected.push('cli_command');
  }

  if (normalized.some((file) => file.startsWith('packages/engine/src/scoring/'))) {
    detected.push('engine_scoring');
  }

  if (normalized.some((file) => file.startsWith('packages/engine/src/learning/') || file.startsWith('packages/engine/src/extract/') || file.startsWith('packages/engine/src/topology/'))) {
    detected.push('pattern_learning');
  }

  return sortUnique(detected).sort((a, b) => FAMILY_ORDER.indexOf(a) - FAMILY_ORDER.indexOf(b));
};

const classifyTaskFamily = (task: string): { families: ExecutionTaskFamily[]; ambiguous: boolean } => {
  const normalized = task.toLowerCase();
  const matched = FAMILY_ORDER.filter((family) => FAMILY_KEYWORDS[family].some((keyword) => normalized.includes(keyword)));
  return {
    families: matched,
    ambiguous: matched.length > 1
  };
};

const buildProposal = (family: ExecutionTaskFamily, scope: ExecutionScope): TaskExecutionProfileProposal => {
  if (family === 'docs_only') {
    return {
      task_family: family,
      scope,
      affected_surfaces: ['docs', 'governance'],
      rule_packs: ['docs-governance'],
      required_validations: ['pnpm playbook docs audit --json'],
      optional_validations: ['pnpm -r build'],
      docs_requirements: ['docs/commands/README.md', 'docs/CHANGELOG.md'],
      parallel_safe: true,
      estimated_change_surface: scope === 'single-file' ? 'small' : 'medium'
    };
  }

  if (family === 'contracts_schema') {
    return {
      task_family: family,
      scope,
      affected_surfaces: ['contracts', 'schemas', 'governance'],
      rule_packs: ['contract-registry', 'schema-governance'],
      required_validations: ['pnpm playbook schema verify --json', 'pnpm -r build'],
      optional_validations: ['pnpm playbook verify --ci --json'],
      docs_requirements: ['docs/contracts/TASK_EXECUTION_PROFILE.md', 'docs/CHANGELOG.md'],
      parallel_safe: false,
      estimated_change_surface: 'medium'
    };
  }

  if (family === 'cli_command') {
    return {
      task_family: family,
      scope,
      affected_surfaces: ['cli', 'docs', 'governance', 'tests'],
      rule_packs: ['command-surface-governance', 'docs-governance'],
      required_validations: ['pnpm -r build', 'pnpm agents:update', 'pnpm agents:check'],
      optional_validations: ['pnpm playbook docs audit --json'],
      docs_requirements: ['README.md', 'docs/commands/README.md', 'docs/CHANGELOG.md'],
      parallel_safe: false,
      estimated_change_surface: 'medium'
    };
  }

  if (family === 'engine_scoring') {
    return {
      task_family: family,
      scope,
      affected_surfaces: ['engine', 'tests', 'governance'],
      rule_packs: ['engine-runtime', 'scoring-safety'],
      required_validations: ['pnpm --filter @zachariahredfield/playbook-engine test', 'pnpm -r build'],
      optional_validations: ['pnpm playbook verify --ci --json'],
      docs_requirements: ['docs/CHANGELOG.md'],
      parallel_safe: false,
      estimated_change_surface: scope === 'single-file' ? 'small' : 'medium'
    };
  }

  return {
    task_family: family,
    scope,
    affected_surfaces: ['engine', 'knowledge', 'tests', 'governance'],
    rule_packs: ['pattern-governance', 'knowledge-integrity'],
    required_validations: ['pnpm --filter @zachariahredfield/playbook-engine test', 'pnpm -r build'],
    optional_validations: ['pnpm playbook patterns list --json'],
    docs_requirements: ['docs/CHANGELOG.md'],
    parallel_safe: false,
    estimated_change_surface: scope === 'single-file' ? 'medium' : 'large'
  };
};

export const buildTaskExecutionProfile = (input: TaskExecutionProfileInput): TaskExecutionProfileArtifact => {
  const scope = inferScope(input.changedFiles, input.affectedPackages);
  const detectedFamilies = input.taskFamily ? [input.taskFamily] : inferFamiliesFromFiles(input.changedFiles);

  const families = sortUnique(detectedFamilies).sort((a, b) => FAMILY_ORDER.indexOf(a) - FAMILY_ORDER.indexOf(b));

  const declaredSurfaces = sortUnique(input.declaredSurfaces ?? []);
  const proposals = families.map((family) => {
    const proposal = buildProposal(family, scope);
    if (declaredSurfaces.length === 0) {
      return proposal;
    }

    return {
      ...proposal,
      affected_surfaces: sortUnique([...proposal.affected_surfaces, ...declaredSurfaces])
    };
  });

  return {
    schemaVersion: '1.0',
    kind: 'task-execution-profile',
    generatedAt: input.generatedAt ?? new Date(0).toISOString(),
    proposalOnly: true,
    profiles: proposals
  };
};

export type ResolveTaskExecutionPlanInput = {
  task: string;
  changedFiles?: string[];
  affectedPackages?: string[];
};

const conservativeFamily = (families: ExecutionTaskFamily[]): ExecutionTaskFamily => {
  if (families.includes('cli_command')) {
    return 'cli_command';
  }

  if (families.includes('contracts_schema')) {
    return 'contracts_schema';
  }

  return families[0] ?? 'docs_only';
};

export const resolveTaskExecutionPlan = (input: ResolveTaskExecutionPlanInput): TaskExecutionPlan => {
  const changedFiles = input.changedFiles ?? [];
  const affectedPackages = input.affectedPackages ?? [];
  const scope = inferScope(changedFiles, affectedPackages);
  const byTask = classifyTaskFamily(input.task);
  const byFiles = inferFamiliesFromFiles(changedFiles);
  const mergedFamilies = sortUnique([...byTask.families, ...byFiles]).sort((a, b) => FAMILY_ORDER.indexOf(a) - FAMILY_ORDER.indexOf(b));

  if (mergedFamilies.length === 0) {
    return {
      schemaVersion: '1.0',
      kind: 'task-execution-plan',
      task: input.task,
      route_status: 'incomplete',
      task_family: 'unsupported',
      route_id: 'unsupported/incomplete',
      affected_surfaces: [],
      estimated_change_surface: 'large',
      rule_packs: [],
      required_validations: [],
      optional_validations: [],
      parallel_lanes: 1,
      mutation_allowed: false,
      warnings: [],
      missing_prerequisites: ['task intent must map to one supported family: docs_only, contracts_schema, cli_command, engine_scoring, pattern_learning']
    };
  }

  const warnings: string[] = [];
  const selectedFamily = byTask.ambiguous ? conservativeFamily(mergedFamilies) : mergedFamilies[0];
  if (byTask.ambiguous) {
    warnings.push(`Ambiguous task-family classification (${mergedFamilies.join(', ')}); selected conservative route ${selectedFamily}.`);
  }

  const profile = buildProposal(selectedFamily, scope);

  return {
    schemaVersion: '1.0',
    kind: 'task-execution-plan',
    task: input.task,
    route_status: 'resolved',
    task_family: selectedFamily,
    route_id: `route/${selectedFamily}/v1`,
    affected_surfaces: profile.affected_surfaces,
    estimated_change_surface: profile.estimated_change_surface,
    rule_packs: profile.rule_packs,
    required_validations: profile.required_validations,
    optional_validations: profile.optional_validations,
    parallel_lanes: profile.parallel_safe ? 2 : 1,
    mutation_allowed: false,
    warnings,
    missing_prerequisites: []
  };
};
