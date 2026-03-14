#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const args = process.argv.slice(2);

const getArg = (flag, fallback) => {
  const index = args.indexOf(flag);
  if (index === -1) return fallback;
  const value = args[index + 1];
  return value && !value.startsWith('--') ? value : fallback;
};

const runtimeRepoRoot = process.cwd();
const targetRepoRoot = path.resolve(getArg('--target-repo', getArg('--repo', process.cwd())));
const configPath = path.resolve(getArg('--config', path.join(targetRepoRoot, 'playbook.fitness.config.json')));
const createdAt = getArg('--created-at', '2026-01-01T00:00:00.000Z');
const runId = getArg('--run-id', 'fitness-pilot-cycle-0001');

const PLAYBOOK_DIRNAME = '.playbook';
const ARTIFACT_DIRS = {
  runCycles: path.join(targetRepoRoot, PLAYBOOK_DIRNAME, 'run-cycles'),
  zettels: path.join(targetRepoRoot, PLAYBOOK_DIRNAME, 'zettels'),
  graph: path.join(targetRepoRoot, PLAYBOOK_DIRNAME, 'graph'),
  groups: path.join(targetRepoRoot, PLAYBOOK_DIRNAME, 'groups'),
  patternDrafts: path.join(targetRepoRoot, PLAYBOOK_DIRNAME, 'pattern-cards', 'drafts'),
  promotion: path.join(targetRepoRoot, PLAYBOOK_DIRNAME, 'promotion'),
  meta: path.join(targetRepoRoot, PLAYBOOK_DIRNAME, 'meta'),
  evidence: path.join(targetRepoRoot, PLAYBOOK_DIRNAME, 'evidence')
};

const IGNORED_DIRS = new Set(['.git', 'node_modules', '.next', 'dist', 'build', PLAYBOOK_DIRNAME]);

const stableId = (...parts) => createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 12);

const toPosix = (entryPath) => entryPath.split(path.sep).join('/');

const walkFiles = async (dir, relative = '') => {
  const absolute = path.join(dir, relative);
  const entries = await readdir(absolute, { withFileTypes: true });
  const files = [];

  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name)) continue;
      files.push(...(await walkFiles(dir, path.join(relative, entry.name))));
      continue;
    }

    if (!entry.isFile()) continue;
    files.push(toPosix(path.join(relative, entry.name)));
  }

  return files;
};

const categoryMatchers = {
  component_structure: (file) => /(^|\/)(components?|ui)(\/|$)/i.test(file) || /\.(tsx|jsx|vue)$/.test(file),
  api_routes: (file) => /(^|\/)(api|routes?)(\/|$)/i.test(file),
  database_models: (file) => /(^|\/)(db|database|models?|schema|prisma)(\/|$)/i.test(file),
  ui_layout_patterns: (file) => /(^|\/)(layout|page|screen|view|styles?)(\/|$)/i.test(file),
  workout_progression_logic: (file) => /(workout|progress|program|plan|session)/i.test(file)
};

const extractZettels = async (files) => {
  const zettels = [];

  for (const [category, matcher] of Object.entries(categoryMatchers)) {
    const matches = files.filter((file) => matcher(file)).slice(0, 6);
    for (const evidencePath of matches) {
      const absolutePath = path.join(targetRepoRoot, evidencePath);
      const source = await readFile(absolutePath, 'utf8');
      const checksum = createHash('sha256').update(source).digest('hex').slice(0, 16);
      zettels.push({
        zettelId: `ztt.${category}.${stableId(category, evidencePath)}`,
        kind: 'observation',
        category,
        title: `${category.replaceAll('_', ' ')} → ${path.basename(evidencePath)}`,
        mechanism: `Observed ${category.replaceAll('_', ' ')} through deterministic repository scan.`,
        invariant: 'Evidence reference must resolve to a real repository file.',
        evidenceRefs: [`file:${evidencePath}#sha256:${checksum}`],
        sourceArtifactPath: evidencePath
      });
    }
  }

  return zettels.sort((a, b) => a.zettelId.localeCompare(b.zettelId));
};

const buildRelationships = (zettels) => {
  const edges = [];
  const byCategory = new Map();

  for (const zettel of zettels) {
    const existing = byCategory.get(zettel.category) ?? [];
    existing.push(zettel);
    byCategory.set(zettel.category, existing);
  }

  for (const [, entries] of [...byCategory.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    for (let i = 1; i < entries.length; i += 1) {
      edges.push({
        from: entries[i - 1].zettelId,
        to: entries[i].zettelId,
        relation: 'same-category'
      });
    }
  }

  return edges;
};

const buildCandidatePatterns = (zettels) => {
  const patterns = [];

  for (const [category, entries] of Object.entries(
    zettels.reduce((acc, zettel) => {
      acc[zettel.category] = acc[zettel.category] ?? [];
      acc[zettel.category].push(zettel);
      return acc;
    }, {})
  )) {
    if (entries.length < 2) continue;

    patterns.push({
      candidateId: `candidate.${stableId(category, String(entries.length))}`,
      title: `${category.replaceAll('_', ' ')} repetition`,
      mechanism: `Repeated ${category.replaceAll('_', ' ')} signatures were detected across files.`,
      invariant: 'At least two independent evidence references are required.',
      evidenceRefs: entries.slice(0, 4).map((entry) => entry.evidenceRefs[0]),
      sourceZettelIds: entries.map((entry) => entry.zettelId)
    });
  }

  return patterns.sort((a, b) => a.candidateId.localeCompare(b.candidateId));
};

const loadJson = async (filePath, fallback) => {
  try {
    const raw = await readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
};

const toConfidence = (count, total) => Number((Math.min(1, count / Math.max(1, total))).toFixed(2));

const toCrossRepoSuccess = (metaFindings) => {
  const byType = Object.fromEntries(metaFindings.findings.map((finding) => [finding.findingType, finding.score]));
  const stability = 1 - (byType.architecture_drift ?? 0);
  const coherence = 1 - (byType.duplication ?? 0);
  const reuse = byType.pattern_reuse ?? 0;
  return Number(((stability + coherence + reuse) / 3).toFixed(2));
};

const buildCrossRepoEvidenceRecord = ({ pilotConfig, zettels, relationships, candidatePatterns, drafts, metaFindings }) => {
  const repositoryName = pilotConfig?.pilot?.repository ?? path.basename(targetRepoRoot);
  const repositoryId = stableId(repositoryName.toLowerCase(), targetRepoRoot.toLowerCase());

  const observedPatterns = candidatePatterns.map((pattern) => ({
    patternId: pattern.candidateId,
    title: pattern.title,
    observedInRepo: repositoryName,
    sourceRunCycleId: runId,
    evidenceRefs: pattern.evidenceRefs,
    sourceZettelIds: pattern.sourceZettelIds,
    confidence: toConfidence(pattern.evidenceRefs.length, zettels.length)
  }));

  const evaluatedPatterns = drafts.map((draft) => ({
    patternId: draft.patternId,
    status: draft.status,
    evidenceCount: draft.evidenceRefs.length,
    crossRepoSuccess: toCrossRepoSuccess(metaFindings),
    outcomeRefs: metaFindings.findings.map((finding) => finding.findingType)
  }));

  const patternOutcomes = metaFindings.findings.map((finding) => ({
    outcomeId: `outcome.${stableId(repositoryId, finding.findingType, String(finding.score))}`,
    findingType: finding.findingType,
    description: finding.description,
    score: finding.score,
    sourceRunCycleId: runId
  }));

  const patternRelations = relationships.map((relation) => ({
    relationId: `rel.${stableId(relation.from, relation.to, relation.relation)}`,
    fromPatternRef: relation.from,
    toPatternRef: relation.to,
    relation: relation.relation,
    sourceRunCycleId: runId
  }));

  return {
    repository: {
      repositoryId,
      repositoryName,
      repositoryPath: targetRepoRoot
    },
    sourceRunCycleId: runId,
    createdAt,
    layers: {
      observedPatterns,
      evaluatedPatterns,
      canonicalDoctrine: []
    },
    patternInstances: observedPatterns,
    patternOutcomes,
    patternRelations,
    crossRepoSuccess: toCrossRepoSuccess(metaFindings)
  };
};

const ensureDirectories = async () => {
  await Promise.all(Object.values(ARTIFACT_DIRS).map((dir) => mkdir(dir, { recursive: true })));
};

const main = async () => {
  const rootStat = await stat(targetRepoRoot);
  if (!rootStat.isDirectory()) {
    throw new Error(`Target repository path is not a directory: ${targetRepoRoot}`);
  }

  const runtimeStat = await stat(path.join(runtimeRepoRoot, 'packages', 'cli', 'dist', 'main.js')).catch(() => null);
  if (!runtimeStat?.isFile()) {
    throw new Error('Run this script from the current Playbook repository root (missing packages/cli/dist/main.js).');
  }

  const configRaw = await readFile(configPath, 'utf8');
  const pilotConfig = JSON.parse(configRaw);

  if (pilotConfig?.advisoryMode?.enabled !== true) {
    throw new Error('Fitness pilot config must enable advisoryMode.enabled=true.');
  }

  const files = await walkFiles(targetRepoRoot);
  const zettels = await extractZettels(files);
  const relationships = buildRelationships(zettels);
  const candidatePatterns = buildCandidatePatterns(zettels);

  const drafts = candidatePatterns.map((candidate) => ({
    patternId: `draft.${stableId(candidate.candidateId)}`,
    title: `Pattern Draft: ${candidate.title}`,
    mechanism: candidate.mechanism,
    invariant: candidate.invariant,
    evidenceRefs: candidate.evidenceRefs,
    status: 'review',
    sourceZettelIds: candidate.sourceZettelIds
  }));

  const runCycle = {
    schemaVersion: '1.0',
    kind: 'playbook-run-cycle',
    runCycleId: runId,
    createdAt,
    mode: 'advisory',
    reasoningLoop: ['observe', 'represent', 'relate', 'compress', 'decide'],
    safeguards: {
      automaticContractMutation: false,
      automaticCodeEdits: false,
      crossRepoPropagation: false,
      broadFunctorTransforms: false,
      ciEnforcement: false
    },
    boundedStages: [
      'evidence intake',
      'zettels',
      'graph/grouping',
      'candidate patterns',
      'draft pattern cards',
      'promotion review queue',
      'meta findings'
    ],
    artifactPaths: {
      runCycles: '.playbook/run-cycles',
      zettels: '.playbook/zettels',
      graph: '.playbook/graph',
      groups: '.playbook/groups',
      patternDrafts: '.playbook/pattern-cards/drafts',
      promotion: '.playbook/promotion',
      meta: '.playbook/meta',
      evidence: '.playbook/evidence'
    },
    closedLearningLoop: [
      'repo observation',
      'pattern graph',
      'attractor scoring',
      'outcome correlation',
      'pattern fitness',
      'doctrine candidates',
      'governance review',
      'architecture guidance'
    ],
    zettelCount: zettels.length,
    relationshipCount: relationships.length,
    candidatePatternCount: candidatePatterns.length
  };

  const groupArtifacts = {
    schemaVersion: '1.0',
    kind: 'playbook-zettel-groups',
    runCycleId: runId,
    groups: Object.entries(
      zettels.reduce((acc, zettel) => {
        acc[zettel.category] = acc[zettel.category] ?? [];
        acc[zettel.category].push(zettel.zettelId);
        return acc;
      }, {})
    )
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([category, ids]) => ({ category, zettelIds: ids }))
  };

  const metaFindings = {
    schemaVersion: '1.0',
    kind: 'playbook-meta-findings',
    runCycleId: runId,
    createdAt,
    findings: [
      {
        findingType: 'duplication',
        description: 'Repeated structural signatures detected across extracted zettels.',
        score: Number((candidatePatterns.length / Math.max(1, zettels.length)).toFixed(2))
      },
      {
        findingType: 'architecture_drift',
        description: 'API and database observations outside expected folders indicate potential drift.',
        score: Number(
          (
            zettels.filter((entry) =>
              (entry.category === 'api_routes' && !entry.sourceArtifactPath.includes('/api/')) ||
              (entry.category === 'database_models' && !/(db|database|models|schema|prisma)/i.test(entry.sourceArtifactPath))
            ).length / Math.max(1, zettels.length)
          ).toFixed(2)
        )
      },
      {
        findingType: 'pattern_reuse',
        description: 'Candidate patterns with multiple evidence refs are reusable drafts for promotion review.',
        score: Number((drafts.filter((draft) => draft.evidenceRefs.length >= 2).length / Math.max(1, drafts.length)).toFixed(2))
      }
    ]
  };

  const reviewQueue = {
    schemaVersion: '1.0',
    kind: 'playbook-promotion-review-queue',
    runCycleId: runId,
    createdAt,
    advisoryOnly: true,
    items: drafts.map((draft) => ({
      patternId: draft.patternId,
      title: draft.title,
      mechanism: draft.mechanism,
      invariant: draft.invariant,
      evidenceRefs: draft.evidenceRefs,
      reviewStatus: 'queued'
    }))
  };

  const evidenceArtifactPath = path.join(ARTIFACT_DIRS.evidence, 'cross-repo-evidence.json');
  const existingEvidence = await loadJson(evidenceArtifactPath, {
    schemaVersion: '1.0',
    kind: 'playbook-cross-repo-evidence',
    updatedAt: createdAt,
    repositories: []
  });

  const repoEvidence = buildCrossRepoEvidenceRecord({
    pilotConfig,
    zettels,
    relationships,
    candidatePatterns,
    drafts,
    metaFindings
  });

  const repositories = (existingEvidence.repositories ?? []).filter(
    (entry) => entry?.repository?.repositoryId !== repoEvidence.repository.repositoryId
  );
  repositories.push(repoEvidence);
  repositories.sort((a, b) => a.repository.repositoryName.localeCompare(b.repository.repositoryName));

  const updatedEvidence = {
    schemaVersion: '1.0',
    kind: 'playbook-cross-repo-evidence',
    updatedAt: createdAt,
    repositories,
    summary: {
      repositoryCount: repositories.length,
      crossRepoSuccess: Number(
        (repositories.reduce((sum, entry) => sum + (entry.crossRepoSuccess ?? 0), 0) / Math.max(1, repositories.length)).toFixed(2)
      )
    }
  };

  await ensureDirectories();

  await writeFile(path.join(ARTIFACT_DIRS.runCycles, `${runId}.json`), `${JSON.stringify(runCycle, null, 2)}\n`);
  await writeFile(path.join(ARTIFACT_DIRS.zettels, `${runId}.json`), `${JSON.stringify({ schemaVersion: '1.0', kind: 'playbook-zettels', runCycleId: runId, zettels }, null, 2)}\n`);
  await writeFile(path.join(ARTIFACT_DIRS.graph, `${runId}.json`), `${JSON.stringify({ schemaVersion: '1.0', kind: 'playbook-zettel-graph', runCycleId: runId, edges: relationships }, null, 2)}\n`);
  await writeFile(path.join(ARTIFACT_DIRS.groups, `${runId}.json`), `${JSON.stringify(groupArtifacts, null, 2)}\n`);
  await writeFile(path.join(ARTIFACT_DIRS.patternDrafts, `${runId}.json`), `${JSON.stringify({ schemaVersion: '1.0', kind: 'playbook-pattern-card-drafts', runCycleId: runId, drafts }, null, 2)}\n`);
  await writeFile(path.join(ARTIFACT_DIRS.promotion, `${runId}.json`), `${JSON.stringify(reviewQueue, null, 2)}\n`);
  await writeFile(path.join(ARTIFACT_DIRS.meta, `${runId}.json`), `${JSON.stringify(metaFindings, null, 2)}\n`);
  await writeFile(evidenceArtifactPath, `${JSON.stringify(updatedEvidence, null, 2)}\n`);

  console.log(`Playbook runtime: ${runtimeRepoRoot}`);
  console.log(`External target repository: ${targetRepoRoot}`);
  console.log(`Generated advisory pilot artifacts under: ${path.join(targetRepoRoot, PLAYBOOK_DIRNAME)}`);
  console.log(`Run cycle: ${runId}`);
  console.log(`Cross-repo evidence updated: ${evidenceArtifactPath}`);
};

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
