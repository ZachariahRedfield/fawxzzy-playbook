import fs from 'node:fs';
import path from 'node:path';
import type { PlaybookConfig } from '../config/schema.js';

export const MEMORY_PRESSURE_STATUS_RELATIVE_PATH = '.playbook/memory-pressure.json' as const;
export const MEMORY_PRESSURE_STATUS_LEGACY_RELATIVE_PATH = '.playbook/memory/pressure-status.json' as const;

const CANONICAL_MEMORY_ARTIFACTS = new Set<string>([
  '.playbook/memory/knowledge/decisions.json',
  '.playbook/memory/knowledge/patterns.json',
  '.playbook/memory/knowledge/failure-modes.json',
  '.playbook/memory/knowledge/invariants.json'
]);

export type MemoryPressureBand = 'normal' | 'warm' | 'pressure' | 'critical';
export type MemoryClass = 'canonical' | 'compactable' | 'disposable';

export type MemoryPressureAction =
  | 'dedupe-low-signal-memory'
  | 'increase-compaction-cadence'
  | 'summarize-runtime-events-into-rollups'
  | 'tighten-low-value-admission'
  | 'preserve-canonical-artifacts'
  | 'aggressive-compaction'
  | 'evict-disposable-after-summary';

export type MemoryPressureStatusArtifact = {
  schemaVersion: '1.0';
  kind: 'playbook-memory-pressure-status';
  command: 'memory-pressure-evaluate';
  generatedAt: string;
  reviewOnly: true;
  authority: {
    mutation: 'read-only';
    promotion: 'review-required';
  };
  policy: PlaybookConfig['memory']['pressurePolicy'];
  usage: {
    usedBytes: number;
    fileCount: number;
    eventCount: number;
  };
  score: {
    bytes: number;
    files: number;
    events: number;
    normalized: number;
  };
  band: MemoryPressureBand;
  previousBand: MemoryPressureBand | null;
  classes: {
    canonical: string[];
    compactable: string[];
    disposable: string[];
  };
  invariants: {
    canonicalEvictionCandidates: string[];
    disposableEvictionCandidates: string[];
    disposableEvictionRequiresSummary: boolean;
  };
  recommendedActions: MemoryPressureAction[];
};

const uniqueSorted = (values: string[]): string[] => [...new Set(values)].sort((a, b) => a.localeCompare(b));

const listFilesRecursive = (rootPath: string): string[] => {
  if (!fs.existsSync(rootPath)) return [];
  const entries = fs.readdirSync(rootPath, { withFileTypes: true });
  const paths: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(rootPath, entry.name);
    if (entry.isDirectory()) {
      paths.push(...listFilesRecursive(fullPath));
    } else if (entry.isFile()) {
      paths.push(fullPath);
    }
  }
  return paths;
};

const toRelativePlaybookPath = (repoRoot: string, absolutePath: string): string =>
  path.relative(repoRoot, absolutePath).replaceAll(path.sep, '/');

const eventCountFromIndex = (repoRoot: string): number => {
  const indexPath = path.join(repoRoot, '.playbook/memory/index.json');
  if (!fs.existsSync(indexPath)) return 0;
  try {
    const parsed = JSON.parse(fs.readFileSync(indexPath, 'utf8')) as { events?: unknown[] };
    return Array.isArray(parsed.events) ? parsed.events.length : 0;
  } catch {
    return 0;
  }
};

const ratio = (used: number, budget: number): number => {
  if (budget <= 0) return 0;
  return used / budget;
};

export const computeMemoryPressureScore = (input: {
  usedBytes: number;
  fileCount: number;
  eventCount: number;
  policy: PlaybookConfig['memory']['pressurePolicy'];
}): MemoryPressureStatusArtifact['score'] => {
  const bytes = ratio(input.usedBytes, input.policy.budgetBytes);
  const files = ratio(input.fileCount, input.policy.budgetFiles);
  const events = ratio(input.eventCount, input.policy.budgetEvents);
  return {
    bytes,
    files,
    events,
    normalized: Math.max(bytes, files, events)
  };
};

const thresholdFor = (band: Exclude<MemoryPressureBand, 'normal'>, policy: PlaybookConfig['memory']['pressurePolicy']): number =>
  band === 'warm' ? policy.watermarks.warm : band === 'pressure' ? policy.watermarks.pressure : policy.watermarks.critical;

export const resolveMemoryPressureBand = (input: {
  score: number;
  previousBand: MemoryPressureBand | null;
  policy: PlaybookConfig['memory']['pressurePolicy'];
}): MemoryPressureBand => {
  const hysteresis = Math.max(0, input.policy.hysteresis);
  const score = input.score;
  const previousBand = input.previousBand ?? 'normal';
  const escalate = (band: Exclude<MemoryPressureBand, 'normal'>): boolean => score >= thresholdFor(band, input.policy);
  const downshift = (band: Exclude<MemoryPressureBand, 'normal'>): boolean => score < thresholdFor(band, input.policy) - hysteresis;

  if (previousBand === 'critical') {
    if (!downshift('critical')) return 'critical';
    if (escalate('pressure')) return 'pressure';
    if (escalate('warm')) return 'warm';
    return 'normal';
  }

  if (previousBand === 'pressure') {
    if (escalate('critical')) return 'critical';
    if (!downshift('pressure')) return 'pressure';
    if (escalate('warm')) return 'warm';
    return 'normal';
  }

  if (previousBand === 'warm') {
    if (escalate('critical')) return 'critical';
    if (escalate('pressure')) return 'pressure';
    if (!downshift('warm')) return 'warm';
    return 'normal';
  }

  if (escalate('critical')) return 'critical';
  if (escalate('pressure')) return 'pressure';
  if (escalate('warm')) return 'warm';
  return 'normal';
};

export const classifyMemoryArtifact = (relativePath: string): MemoryClass => {
  if (CANONICAL_MEMORY_ARTIFACTS.has(relativePath)) return 'canonical';
  if (relativePath.startsWith('.playbook/memory/knowledge/')) return 'compactable';
  if (relativePath === '.playbook/memory/index.json') return 'compactable';
  if (relativePath === '.playbook/memory/replay-candidates.json') return 'compactable';
  if (relativePath === '.playbook/memory/consolidation-candidates.json') return 'compactable';
  if (relativePath === '.playbook/memory/compaction-review.json') return 'compactable';
  if (relativePath.startsWith('.playbook/memory/events/')) return 'disposable';
  return 'disposable';
};

export const recommendedActionsForBand = (band: MemoryPressureBand): MemoryPressureAction[] => {
  if (band === 'normal') return [];
  if (band === 'warm') {
    return ['dedupe-low-signal-memory', 'increase-compaction-cadence'];
  }
  if (band === 'pressure') {
    return ['dedupe-low-signal-memory', 'increase-compaction-cadence', 'summarize-runtime-events-into-rollups', 'tighten-low-value-admission'];
  }
  return [
    'preserve-canonical-artifacts',
    'summarize-runtime-events-into-rollups',
    'aggressive-compaction',
    'evict-disposable-after-summary'
  ];
};

const readPreviousBand = (repoRoot: string): MemoryPressureBand | null => {
  const candidatePaths = [MEMORY_PRESSURE_STATUS_RELATIVE_PATH, MEMORY_PRESSURE_STATUS_LEGACY_RELATIVE_PATH];
  for (const relativePath of candidatePaths) {
    const statusPath = path.join(repoRoot, relativePath);
    if (!fs.existsSync(statusPath)) continue;
    try {
      const parsed = JSON.parse(fs.readFileSync(statusPath, 'utf8')) as { band?: MemoryPressureBand };
      return parsed.band ?? null;
    } catch {
      continue;
    }
  }
  return null;
};

export const buildMemoryPressureStatusArtifact = (input: {
  repoRoot: string;
  policy: PlaybookConfig['memory']['pressurePolicy'];
  previousBand?: MemoryPressureBand | null;
}): MemoryPressureStatusArtifact => {
  const memoryRoot = path.join(input.repoRoot, '.playbook/memory');
  const files = listFilesRecursive(memoryRoot);
  const relativePaths = uniqueSorted(files.map((absolutePath) => toRelativePlaybookPath(input.repoRoot, absolutePath)));
  const usedBytes = files.reduce((total, absolutePath) => total + fs.statSync(absolutePath).size, 0);
  const fileCount = files.length;
  const eventCount = eventCountFromIndex(input.repoRoot);
  const previousBand = input.previousBand ?? readPreviousBand(input.repoRoot);
  const score = computeMemoryPressureScore({ usedBytes, fileCount, eventCount, policy: input.policy });
  const band = resolveMemoryPressureBand({ score: score.normalized, previousBand, policy: input.policy });
  const classes = {
    canonical: relativePaths.filter((relativePath) => classifyMemoryArtifact(relativePath) === 'canonical'),
    compactable: relativePaths.filter((relativePath) => classifyMemoryArtifact(relativePath) === 'compactable'),
    disposable: relativePaths.filter((relativePath) => classifyMemoryArtifact(relativePath) === 'disposable')
  };
  const recommendedActions = recommendedActionsForBand(band);

  return {
    schemaVersion: '1.0',
    kind: 'playbook-memory-pressure-status',
    command: 'memory-pressure-evaluate',
    generatedAt: new Date(0).toISOString(),
    reviewOnly: true,
    authority: {
      mutation: 'read-only',
      promotion: 'review-required'
    },
    policy: input.policy,
    usage: {
      usedBytes,
      fileCount,
      eventCount
    },
    score,
    band,
    previousBand,
    classes,
    invariants: {
      canonicalEvictionCandidates: [],
      disposableEvictionCandidates: band === 'critical' ? [...classes.disposable] : [],
      disposableEvictionRequiresSummary: true
    },
    recommendedActions
  };
};

export const writeMemoryPressureStatusArtifact = (repoRoot: string, artifact: MemoryPressureStatusArtifact): string => {
  const outputPath = path.join(repoRoot, MEMORY_PRESSURE_STATUS_RELATIVE_PATH);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
  const legacyPath = path.join(repoRoot, MEMORY_PRESSURE_STATUS_LEGACY_RELATIVE_PATH);
  fs.mkdirSync(path.dirname(legacyPath), { recursive: true });
  fs.writeFileSync(legacyPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
  return outputPath;
};

export const evaluateMemoryPressurePolicy = (repoRoot: string, policy: PlaybookConfig['memory']['pressurePolicy']): MemoryPressureStatusArtifact => {
  const artifact = buildMemoryPressureStatusArtifact({ repoRoot, policy });
  writeMemoryPressureStatusArtifact(repoRoot, artifact);
  return artifact;
};
