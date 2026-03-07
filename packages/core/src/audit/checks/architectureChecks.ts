import fs from 'node:fs';
import path from 'node:path';
import type { ArchitectureAuditCheck, ArchitectureAuditResult, ArchitectureAuditSeverity, ArchitectureAuditStatus } from '../types.js';

type ArchitectureCheckDefinition = {
  id: string;
  title: string;
  severity: ArchitectureAuditSeverity;
  evaluate: (repoRoot: string) => Omit<ArchitectureAuditResult, 'id' | 'title' | 'severity' | 'evidence'> & {
    evidence: string[];
  };
};

const compareText = (left: string, right: string): number => left.localeCompare(right);

const sortStable = (values: string[]): string[] => [...values].sort(compareText);

const exists = (repoRoot: string, relativePath: string): boolean => fs.existsSync(path.join(repoRoot, relativePath));

const readText = (repoRoot: string, relativePath: string): string | undefined => {
  const absolutePath = path.join(repoRoot, relativePath);
  if (!fs.existsSync(absolutePath)) {
    return undefined;
  }
  return fs.readFileSync(absolutePath, 'utf8');
};

const readJsonRecord = (repoRoot: string, relativePath: string): Record<string, unknown> | undefined => {
  const raw = readText(repoRoot, relativePath);
  if (!raw) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
};

const statusFromCounts = (warnCount: number, failCount: number): ArchitectureAuditStatus => {
  if (failCount > 0) {
    return 'fail';
  }
  return warnCount > 0 ? 'warn' : 'pass';
};

const lowerCase = (value: string | undefined): string => value?.toLowerCase() ?? '';

const containsAny = (value: string | undefined, phrases: string[]): boolean => {
  const normalized = lowerCase(value);
  return phrases.some((phrase) => normalized.includes(phrase.toLowerCase()));
};

const includesAllTokens = (value: string | undefined, tokens: string[]): boolean => {
  const normalized = lowerCase(value);
  return tokens.every((token) => normalized.includes(token.toLowerCase()));
};

const hasAnyConceptPhrase = (value: string | undefined, conceptPhraseGroups: string[][]): boolean => {
  const normalized = lowerCase(value);
  return conceptPhraseGroups.some((phraseGroup) => phraseGroup.some((phrase) => normalized.includes(phrase.toLowerCase())));
};

const toEvidenceRef = (relativePath: string, detail: string): string => `source=${relativePath}: ${detail}`;

const toResult = (definition: ArchitectureCheckDefinition, repoRoot: string): ArchitectureAuditResult => {
  const evaluated = definition.evaluate(repoRoot);
  return {
    id: definition.id,
    title: definition.title,
    severity: definition.severity,
    status: evaluated.status,
    recommendation: evaluated.recommendation,
    evidence: sortStable(evaluated.evidence)
  };
};

/**
 * Keep this list declarative: adding a new audit check should only require appending
 * a definition here (plus any tiny helper), without runner/formatter wiring changes.
 */
const architectureCheckDefinitions: ArchitectureCheckDefinition[] = [
  {
    id: 'artifact.evolution-policy',
    title: 'Artifact evolution policy',
    severity: 'medium',
    evaluate: (repoRoot) => {
      const policyPath = 'docs/contracts/ARTIFACT_EVOLUTION_POLICY.md';
      const policyExists = exists(repoRoot, policyPath);

      return {
        status: policyExists ? 'pass' : 'warn',
        evidence: [
          policyExists
            ? toEvidenceRef(policyPath, 'artifact evolution policy is present')
            : toEvidenceRef(policyPath, 'artifact evolution policy is missing')
        ],
        recommendation: policyExists
          ? 'Keep this policy updated whenever persisted artifact contracts evolve.'
          : `Create ${policyPath} with schema evolution, compatibility, and regeneration guidance.`
      };
    }
  },
  {
    id: 'artifact.schema-versioning',
    title: 'Artifact schema versioning',
    severity: 'medium',
    evaluate: (repoRoot) => {
      const artifactFiles = sortStable(['.playbook/repo-index.json', '.playbook/repo-graph.json']);
      const presentFiles = artifactFiles.filter((relativePath) => exists(repoRoot, relativePath));

      if (presentFiles.length === 0) {
        return {
          status: 'warn',
          evidence: [toEvidenceRef('.playbook', 'persisted repository-intelligence artifacts are missing')],
          recommendation: 'Run `playbook index` and ensure persisted artifacts include a top-level `schemaVersion` field.'
        };
      }

      const missingSchemaVersion = sortStable(
        presentFiles.filter((relativePath) => {
          const artifact = readJsonRecord(repoRoot, relativePath);
          return !artifact || typeof artifact.schemaVersion !== 'string' || artifact.schemaVersion.trim().length === 0;
        })
      );

      const evidence = presentFiles.map((relativePath) => {
        const artifact = readJsonRecord(repoRoot, relativePath);
        return typeof artifact?.schemaVersion === 'string'
          ? toEvidenceRef(relativePath, `schemaVersion=${artifact.schemaVersion}`)
          : toEvidenceRef(relativePath, 'schemaVersion is missing');
      });

      return {
        status: missingSchemaVersion.length > 0 ? 'warn' : 'pass',
        evidence,
        recommendation:
          missingSchemaVersion.length > 0
            ? `Ensure all persisted artifacts include a top-level schemaVersion (missing: ${missingSchemaVersion.join(', ')}).`
            : 'Preserve schemaVersion in all persisted artifacts and bump versions using the artifact evolution policy.'
      };
    }
  },
  {
    id: 'scm.context-layer',
    title: 'SCM/git context normalization layer',
    severity: 'medium',
    evaluate: (repoRoot) => {
      const sharedScmCandidates = sortStable(['packages/engine/src/git/base.ts', 'packages/engine/src/git/diff.ts']);
      const foundCandidates = sharedScmCandidates.filter((relativePath) => exists(repoRoot, relativePath));
      const docsPath = 'docs/architecture/SCM_CONTEXT_LAYER.md';
      const docsContent = readText(repoRoot, docsPath);
      const docsExists = Boolean(docsContent);
      const hasSharedLanguage = includesAllTokens(docsContent, ['shared']) && containsAny(docsContent, ['normalization', 'normalize', 'context']);
      const warnCount = (foundCandidates.length === 0 ? 1 : 0) + (docsExists ? 0 : 1) + (hasSharedLanguage ? 0 : 1);

      const evidence = [
        foundCandidates.length > 0
          ? toEvidenceRef(foundCandidates.join(','), `shared SCM utilities found (${foundCandidates.length})`)
          : toEvidenceRef('packages/engine/src/git', 'shared SCM normalization utilities not found in expected module paths'),
        docsExists
          ? toEvidenceRef(docsPath, 'SCM context layer documentation is present')
          : toEvidenceRef(docsPath, 'SCM context layer documentation is missing'),
        hasSharedLanguage
          ? toEvidenceRef(docsPath, 'documentation describes shared SCM normalization context')
          : toEvidenceRef(docsPath, 'documentation does not clearly describe shared SCM normalization behavior')
      ];

      return {
        status: statusFromCounts(warnCount, 0),
        evidence,
        recommendation:
          warnCount > 0
            ? 'Centralize SCM normalization in shared git-context utilities and document boundaries in docs/architecture/SCM_CONTEXT_LAYER.md.'
            : 'Keep SCM context normalization centralized and update docs when SCM abstractions change.'
      };
    }
  },
  {
    id: 'remediation.trust-model',
    title: 'Remediation trust model',
    severity: 'high',
    evaluate: (repoRoot) => {
      const trustModelPath = 'docs/architecture/REMEDIATION_TRUST_MODEL.md';
      const trustDoc = readText(repoRoot, trustModelPath);
      const hasDoc = Boolean(trustDoc);
      const hasExplicitLevels = containsAny(trustDoc, ['level 0', 'level 1', 'level 2', 'level 3']);
      const hasBoundedScopeLanguage = containsAny(trustDoc, ['bounded']) && containsAny(trustDoc, ['change level', 'change-scope', 'scope level']);
      const hasBoundedScope = hasExplicitLevels || hasBoundedScopeLanguage;
      const warnCount = (hasDoc ? 0 : 1) + (hasBoundedScope ? 0 : 1);

      return {
        status: statusFromCounts(warnCount, 0),
        evidence: [
          hasDoc
            ? toEvidenceRef(trustModelPath, 'remediation trust model documentation is present')
            : toEvidenceRef(trustModelPath, 'remediation trust model documentation is missing'),
          hasBoundedScope
            ? toEvidenceRef(trustModelPath, 'bounded remediation scope/levels are described')
            : toEvidenceRef(trustModelPath, 'bounded remediation scope/levels are not clearly described')
        ],
        recommendation:
          warnCount > 0
            ? `Document deterministic remediation trust boundaries and explicit change levels in ${trustModelPath}.`
            : 'Preserve explicit remediation trust boundaries and keep change-scope levels aligned with plan/apply behavior.'
      };
    }
  },
  {
    id: 'ai.determinism-boundary',
    title: 'AI vs deterministic boundary',
    severity: 'high',
    evaluate: (repoRoot) => {
      const docPath = 'docs/architecture/AI_DETERMINISM_BOUNDARY.md';
      const doc = readText(repoRoot, docPath);
      const hasDoc = Boolean(doc);
      const hasDeterministicSourceOfTruth = containsAny(doc, ['source of truth', 'deterministic']);
      const hasAiAssistBoundary = containsAny(doc, ['ai-assisted', 'ai assistance', 'ai']) && containsAny(doc, ['boundary', 'boundaries', 'ends']);
      const warnCount = (hasDoc ? 0 : 1) + (hasDeterministicSourceOfTruth ? 0 : 1) + (hasAiAssistBoundary ? 0 : 1);

      return {
        status: statusFromCounts(warnCount, 0),
        evidence: [
          hasDoc ? toEvidenceRef(docPath, 'AI/deterministic boundary document is present') : toEvidenceRef(docPath, 'AI/deterministic boundary document is missing'),
          hasDeterministicSourceOfTruth
            ? toEvidenceRef(docPath, 'documentation references deterministic source-of-truth behavior')
            : toEvidenceRef(docPath, 'documentation does not clearly reference deterministic source-of-truth behavior'),
          hasAiAssistBoundary
            ? toEvidenceRef(docPath, 'documentation distinguishes AI assistance from deterministic enforcement')
            : toEvidenceRef(docPath, 'documentation does not clearly distinguish AI assistance from deterministic enforcement')
        ],
        recommendation:
          warnCount > 0
            ? `Update ${docPath} to define where AI assistance ends and deterministic source-of-truth enforcement begins.`
            : 'Keep AI versus deterministic boundaries explicit as new commands and automation features are added.'
      };
    }
  },
  {
    id: 'ecosystem.adapter-boundaries',
    title: 'Ecosystem adapter boundaries',
    severity: 'medium',
    evaluate: (repoRoot) => {
      const docPath = 'docs/architecture/ECOSYSTEM_ADAPTERS.md';
      const doc = readText(repoRoot, docPath);
      const hasDoc = Boolean(doc);
      const hasIsolationBoundary = containsAny(doc, ['isolation', 'isolated']) && containsAny(doc, ['adapter', 'boundary']);
      const warnCount = (hasDoc ? 0 : 1) + (hasIsolationBoundary ? 0 : 1);

      return {
        status: statusFromCounts(warnCount, 0),
        evidence: [
          hasDoc ? toEvidenceRef(docPath, 'ecosystem adapter document is present') : toEvidenceRef(docPath, 'ecosystem adapter document is missing'),
          hasIsolationBoundary
            ? toEvidenceRef(docPath, 'documentation references adapter isolation boundaries')
            : toEvidenceRef(docPath, 'documentation does not clearly reference adapter isolation boundaries')
        ],
        recommendation:
          warnCount > 0
            ? `Create or update ${docPath} to define external tool isolation and adapter boundary contracts.`
            : 'Keep ecosystem adapter boundaries documented as integration surfaces expand.'
      };
    }
  },
  {
    id: 'performance.context-efficiency',
    title: 'Context/token efficiency strategy',
    severity: 'medium',
    evaluate: (repoRoot) => {
      const docPath = 'docs/architecture/CONTEXT_EFFICIENCY_STRATEGY.md';
      const doc = readText(repoRoot, docPath);
      const hasDoc = Boolean(doc);
      const hasIncrementalNarrowContext = hasAnyConceptPhrase(doc, [
        ['incremental context', 'incremental retrieval', 'incremental indexing'],
        ['narrow context', 'targeted context', 'focused context'],
        ['token-aware', 'token budget', 'cost-aware', 'cost aware']
      ]);
      const warnCount = (hasDoc ? 0 : 1) + (hasIncrementalNarrowContext ? 0 : 1);

      return {
        status: statusFromCounts(warnCount, 0),
        evidence: [
          hasDoc ? toEvidenceRef(docPath, 'context-efficiency strategy document is present') : toEvidenceRef(docPath, 'context-efficiency strategy document is missing'),
          hasIncrementalNarrowContext
            ? toEvidenceRef(docPath, 'documentation references incremental/narrow-context or token-aware strategy')
            : toEvidenceRef(docPath, 'documentation does not clearly reference incremental/narrow-context or token-aware strategy')
        ],
        recommendation:
          warnCount > 0
            ? `Create or update ${docPath} with deterministic context/token efficiency patterns.`
            : 'Keep context-efficiency strategy aligned with ask/context/index command behavior.'
      };
    }
  },
  {
    id: 'docs.roadmap-coverage',
    title: 'Roadmap/docs coverage for hardening controls',
    severity: 'medium',
    evaluate: (repoRoot) => {
      const roadmapPath = 'docs/PLAYBOOK_PRODUCT_ROADMAP.md';
      const roadmap = readText(repoRoot, roadmapPath);
      const hasRoadmap = Boolean(roadmap);

      const requiredSignals: Array<{ label: string; conceptPhrases: string[][] }> = [
        { label: 'artifact versioning / evolution', conceptPhrases: [['artifact version', 'schema version'], ['artifact evolution', 'evolution policy', 'artifact schema']] },
        { label: 'SCM normalization / context layer', conceptPhrases: [['scm normalization', 'git normalization'], ['scm context', 'git context', 'context layer']] },
        {
          label: 'remediation trust / scope boundaries',
          conceptPhrases: [['remediation trust', 'trust model'], ['change scope', 'change-scope', 'scope boundary', 'bounded scope', 'change level']]
        },
        {
          label: 'context efficiency / token-aware strategy',
          conceptPhrases: [['context efficiency', 'context strategy', 'narrow context', 'incremental context'], ['token-aware', 'token efficiency', 'token budget', 'cost-aware']]
        },
        {
          label: 'architecture audit / platform hardening coverage',
          conceptPhrases: [['architecture audit', 'audit architecture', 'architecture guardrail'], ['platform hardening', 'hardening controls']]
        }
      ];

      const missingSignals = requiredSignals
        .filter((signal) => !hasAnyConceptPhrase(roadmap, signal.conceptPhrases))
        .map((signal) => signal.label);

      const hasCoverageHeading = hasAnyConceptPhrase(roadmap, [
        ['platform hardening'],
        ['architecture hardening'],
        ['hardening controls'],
        ['architecture guardrails']
      ]);
      const warnCount = (hasRoadmap ? 0 : 1) + (hasCoverageHeading ? 0 : 1) + (missingSignals.length > 0 ? 1 : 0);

      return {
        status: statusFromCounts(warnCount, 0),
        evidence: [
          hasRoadmap ? toEvidenceRef(roadmapPath, 'roadmap document is present') : toEvidenceRef(roadmapPath, 'roadmap document is missing'),
          hasCoverageHeading
            ? toEvidenceRef(roadmapPath, 'roadmap includes a hardening/guardrails coverage section')
            : toEvidenceRef(roadmapPath, 'roadmap does not include a clear hardening/guardrails coverage section'),
          missingSignals.length === 0
            ? toEvidenceRef(roadmapPath, 'roadmap covers required hardening concepts')
            : toEvidenceRef(roadmapPath, `roadmap missing hardening concepts: ${missingSignals.join(', ')}`)
        ],
        recommendation:
          warnCount > 0
            ? 'Add roadmap hardening coverage for artifact versioning/evolution, SCM normalization context, remediation trust scope boundaries, context/token efficiency, and repeatable architecture audit controls.'
            : 'Keep roadmap hardening coverage synchronized with architecture guardrail docs and audit checks.'
      };
    }
  }
];

const compareDefinitions = (left: ArchitectureCheckDefinition, right: ArchitectureCheckDefinition): number => left.id.localeCompare(right.id);

export const architectureAuditChecks: ArchitectureAuditCheck[] = [...architectureCheckDefinitions]
  .sort(compareDefinitions)
  .map((definition) => ({
    id: definition.id,
    title: definition.title,
    run: ({ repoRoot }) => toResult(definition, repoRoot)
  }));
