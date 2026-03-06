import fs from 'node:fs';
import path from 'node:path';
import { analyzeRepo } from '../analyze/index.js';
import { loadConfig } from '../config/load.js';
import { verifyRepo } from '../verify/index.js';

type RepoIndexPayload = {
  framework?: string;
  language?: string;
  architecture?: {
    features?: string[];
  };
};

export type GovernanceStatusItem = {
  id: 'playbook-config' | 'architecture-docs' | 'checklist-verify-step' | 'repo-index';
  ok: boolean;
  message: string;
};

export type RepositoryHealth = {
  framework: string;
  language: string;
  architecture: string;
  governanceStatus: GovernanceStatusItem[];
  verifySummary: {
    ok: boolean;
    failures: number;
    warnings: number;
  };
  suggestedActions: string[];
  issues: string[];
};

const parseRepoIndex = (repoRoot: string): { payload: RepoIndexPayload | null; exists: boolean; outdated: boolean } => {
  const indexPath = path.join(repoRoot, '.playbook', 'repo-index.json');
  if (!fs.existsSync(indexPath)) {
    return { payload: null, exists: false, outdated: true };
  }

  let payload: RepoIndexPayload | null = null;
  try {
    payload = JSON.parse(fs.readFileSync(indexPath, 'utf8')) as RepoIndexPayload;
  } catch {
    return { payload: null, exists: true, outdated: true };
  }

  const indexMtime = fs.statSync(indexPath).mtimeMs;
  const freshnessChecks = [
    path.join(repoRoot, 'package.json'),
    path.join(repoRoot, 'playbook.config.json'),
    path.join(repoRoot, 'docs', 'ARCHITECTURE.md'),
    path.join(repoRoot, 'docs', 'PLAYBOOK_CHECKLIST.md')
  ];

  const outdated = freshnessChecks
    .filter((candidate) => fs.existsSync(candidate))
    .some((candidate) => fs.statSync(candidate).mtimeMs > indexMtime);

  return { payload, exists: true, outdated };
};

const inferArchitecture = (repoRoot: string, repoIndex: RepoIndexPayload | null): string => {
  const indexedFeatures = repoIndex?.architecture?.features;
  if (Array.isArray(indexedFeatures) && indexedFeatures.length >= 3) {
    return 'Modular Monolith';
  }

  if (fs.existsSync(path.join(repoRoot, 'packages'))) {
    return 'Monorepo';
  }

  if (fs.existsSync(path.join(repoRoot, 'src', 'features'))) {
    return 'Modular Monolith';
  }

  return 'Unknown';
};

const normalizeLanguage = (value: string): string => {
  if (!value) {
    return 'Unknown';
  }

  if (value.toLowerCase() === 'typescript') {
    return 'TypeScript';
  }

  return value[0].toUpperCase() + value.slice(1);
};

const resolveFramework = (repoRoot: string, indexedFramework: string | undefined): string => {
  if (indexedFramework && indexedFramework !== 'unknown' && indexedFramework !== 'node') {
    return indexedFramework;
  }

  const analyzed = analyzeRepo(repoRoot);
  const nextSignal = analyzed.detected.find((item) => item.id === 'nextjs');
  if (nextSignal) {
    return 'Next.js';
  }

  if (indexedFramework && indexedFramework !== 'unknown') {
    return indexedFramework;
  }

  return 'Unknown';
};

const checklistHasVerifyStep = (repoRoot: string, checklistPath: string): boolean => {
  const absolutePath = path.join(repoRoot, checklistPath);
  if (!fs.existsSync(absolutePath)) {
    return false;
  }

  const content = fs.readFileSync(absolutePath, 'utf8');
  return /(verify|verification)/i.test(content);
};

export const generateRepositoryHealth = (repoRoot: string): RepositoryHealth => {
  const { config, warning } = loadConfig(repoRoot);
  const repoIndex = parseRepoIndex(repoRoot);
  const verify = verifyRepo(repoRoot);

  const architectureDocsPresent = fs.existsSync(path.join(repoRoot, config.docs.architecturePath));
  const hasChecklistVerifyStep = checklistHasVerifyStep(repoRoot, config.docs.checklistPath);

  const governanceStatus: GovernanceStatusItem[] = [
    {
      id: 'playbook-config',
      ok: !warning,
      message: warning ? 'Playbook config missing; defaults loaded' : 'Playbook config detected'
    },
    {
      id: 'architecture-docs',
      ok: architectureDocsPresent,
      message: architectureDocsPresent ? 'Architecture docs present' : 'Architecture docs missing'
    },
    {
      id: 'checklist-verify-step',
      ok: hasChecklistVerifyStep,
      message: hasChecklistVerifyStep ? 'PLAYBOOK_CHECKLIST includes verify step' : 'PLAYBOOK_CHECKLIST missing verify step'
    },
    {
      id: 'repo-index',
      ok: repoIndex.exists && !repoIndex.outdated,
      message: !repoIndex.exists ? 'Repo index missing' : repoIndex.outdated ? 'Repo index outdated' : 'Repo index up to date'
    }
  ];

  const issues = governanceStatus.filter((entry) => !entry.ok).map((entry) => entry.message);
  const suggestedActions = new Set<string>();

  if (verify.failures.length > 0 || verify.warnings.length > 0) {
    suggestedActions.add('playbook plan');
  }

  if (!repoIndex.exists || repoIndex.outdated) {
    suggestedActions.add('playbook analyze');
  }

  return {
    framework: resolveFramework(repoRoot, repoIndex.payload?.framework),
    language: normalizeLanguage(repoIndex.payload?.language ?? 'unknown'),
    architecture: inferArchitecture(repoRoot, repoIndex.payload),
    governanceStatus,
    verifySummary: {
      ok: verify.ok,
      failures: verify.failures.length,
      warnings: verify.warnings.length
    },
    suggestedActions: [...suggestedActions],
    issues
  };
};
