export type ExecutionTaskFamily = 'docs_only' | 'contracts_schema' | 'cli_command' | 'engine_scoring' | 'pattern_learning';

export type ExecutionSurface = 'docs' | 'contracts' | 'schemas' | 'cli' | 'engine' | 'knowledge' | 'tests' | 'governance';

export type ExecutionScope = 'single-file' | 'single-module' | 'multi-module' | 'cross-repo';

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
  estimated_change_surface: 'small' | 'medium' | 'large';
};

export type TaskExecutionProfileArtifact = {
  schemaVersion: '1.0';
  kind: 'task-execution-profile';
  generatedAt: string;
  proposalOnly: true;
  profiles: TaskExecutionProfileProposal[];
};

const FAMILY_ORDER: ExecutionTaskFamily[] = ['docs_only', 'contracts_schema', 'cli_command', 'engine_scoring', 'pattern_learning'];

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

const BASELINE_VALIDATIONS = ['pnpm -r build'];

const buildProposal = (family: ExecutionTaskFamily, scope: ExecutionScope): TaskExecutionProfileProposal => {
  if (family === 'docs_only') {
    return {
      task_family: family,
      scope,
      affected_surfaces: ['docs', 'governance'],
      rule_packs: ['docs-governance'],
      required_validations: ['pnpm playbook docs audit --json'],
      optional_validations: BASELINE_VALIDATIONS,
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
