import fs from 'node:fs';
import path from 'node:path';
import {
  GLOBAL_PATTERNS_RELATIVE_PATH,
  materializePatternFromCandidate,
  materializeStoryFromSource,
  readStoryCandidatesArtifact,
  type PromotionSourceRef
} from '@zachariahredfield/playbook-engine';
import { ExitCode } from '../lib/cliContract.js';
import { stageWorkflowArtifact } from '../lib/workflowPromotion.js';
import {
  buildPromotionReceipt,
  fingerprintPromotionValue,
  writePromotionReceipt,
  type PromotionReceipt
} from '../lib/promotionReceipt.js';

const isPlaybookHomeRoot = (candidateRoot: string): boolean => {
  const packageJsonPath = path.join(candidateRoot, 'package.json');
  if (!fs.existsSync(packageJsonPath)) return false;
  try {
    const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as { name?: unknown };
    return typeof pkg.name === 'string' && pkg.name.toLowerCase().includes('playbook');
  } catch {
    return false;
  }
};

const resolvePlaybookHome = (cwd: string): string => {
  if (process.env.PLAYBOOK_HOME && process.env.PLAYBOOK_HOME.trim()) {
    return path.resolve(cwd, process.env.PLAYBOOK_HOME.trim());
  }
  let current = path.resolve(cwd);
  while (true) {
    if (isPlaybookHomeRoot(current)) return current;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return path.resolve(cwd);
};

const readOption = (args: string[], name: string): string | undefined => {
  const index = args.indexOf(name);
  if (index >= 0) return args[index + 1];
  const prefixed = args.find((arg) => arg.startsWith(`${name}=`));
  return prefixed ? prefixed.slice(name.length + 1) : undefined;
};

const print = (format: 'text' | 'json', payload: unknown): void => {
  if (format === 'json') console.log(JSON.stringify(payload, null, 2));
  else console.log(typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2));
};

type PromoteOptions = { format: 'text' | 'json'; quiet: boolean };

type RepoRegistry = {
  repos?: Array<{ id?: string; root?: string }>;
};

type PatternCandidatesArtifact = {
  candidates?: Array<Record<string, unknown>>;
};

const resolveRepoRootById = (playbookHome: string, cwd: string, repoId: string): string => {
  const cwdName = path.basename(cwd);
  if (cwdName === repoId || path.basename(path.resolve(cwd)) === repoId) {
    return cwd;
  }
  const registryPath = path.join(playbookHome, '.playbook', 'observer', 'repos.json');
  if (!fs.existsSync(registryPath)) {
    throw new Error(`playbook promote: repo ${repoId} is not registered in ${path.relative(playbookHome, registryPath)}`);
  }
  const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8')) as RepoRegistry;
  const match = registry.repos?.find((entry) => entry.id === repoId && typeof entry.root === 'string');
  if (!match?.root) {
    throw new Error(`playbook promote: repo ${repoId} is not registered in .playbook/observer/repos.json`);
  }
  return match.root;
};

const readJsonIfPresent = <T>(targetPath: string): T | null => {
  if (!fs.existsSync(targetPath)) return null;
  return JSON.parse(fs.readFileSync(targetPath, 'utf8')) as T;
};

const readPatternSource = (playbookHome: string, sourceRef: PromotionSourceRef): Record<string, unknown> => {
  const candidateMatch = /^global\/pattern-candidates\/([^/]+)$/.exec(sourceRef);
  if (candidateMatch) {
    const artifact = readJsonIfPresent<PatternCandidatesArtifact>(path.join(playbookHome, '.playbook', 'pattern-candidates.json'));
    const candidate = artifact?.candidates?.find((entry) => String(entry.id ?? '') === candidateMatch[1]);
    if (!candidate) throw new Error(`playbook promote: pattern candidate not found: ${candidateMatch[1]}`);
    return candidate;
  }
  const patternMatch = /^global\/patterns\/([^/]+)$/.exec(sourceRef);
  if (patternMatch) {
    const artifact = readJsonIfPresent<{ patterns?: Array<Record<string, unknown>> }>(path.join(playbookHome, GLOBAL_PATTERNS_RELATIVE_PATH));
    const pattern = artifact?.patterns?.find((entry) => String(entry.id ?? '') === patternMatch[1]);
    if (!pattern) throw new Error(`playbook promote: global pattern not found: ${patternMatch[1]}`);
    return pattern;
  }
  throw new Error(`playbook promote: unsupported pattern source ref: ${sourceRef}`);
};

const parseSourceRef = (sourceRef: PromotionSourceRef): { kind: 'story' | 'pattern-candidate' | 'pattern'; candidateId: string; repoId?: string } => {
  const repoMatch = /^repo\/([^/]+)\/story-candidates\/([^/]+)$/.exec(sourceRef);
  if (repoMatch) return { kind: 'story', repoId: repoMatch[1], candidateId: repoMatch[2] };
  const globalMatch = /^global\/pattern-candidates\/([^/]+)$/.exec(sourceRef);
  if (globalMatch) return { kind: 'pattern-candidate', candidateId: globalMatch[1] };
  const patternMatch = /^global\/patterns\/([^/]+)$/.exec(sourceRef);
  if (patternMatch) return { kind: 'pattern', candidateId: patternMatch[1] };
  throw new Error(`playbook promote: unsupported source ref: ${sourceRef}`);
};

const buildConflictReceipt = (input: {
  promotionKind: PromotionReceipt['promotion_kind'];
  sourceRef: PromotionSourceRef;
  sourceFingerprint: string;
  targetArtifactPath: string;
  targetId: string;
  beforeFingerprint: string | null;
}): PromotionReceipt =>
  buildPromotionReceipt({
    promotion_kind: input.promotionKind,
    source_candidate_ref: input.sourceRef,
    source_fingerprint: input.sourceFingerprint,
    target_artifact_path: input.targetArtifactPath,
    target_id: input.targetId,
    before_fingerprint: input.beforeFingerprint,
    after_fingerprint: input.beforeFingerprint,
    outcome: 'conflict',
    generated_at: new Date().toISOString()
  });

export const runPromote = (cwd: string, args: string[], options: PromoteOptions): number => {
  const target = args[0];
  const sourceRef = args[1] as PromotionSourceRef | undefined;
  const playbookHome = resolvePlaybookHome(cwd);

  if ((target !== 'story' && target !== 'pattern') || !sourceRef) {
    print(options.format, {
      schemaVersion: '1.0',
      command: 'promote',
      error: 'Usage: playbook promote <story|pattern> <candidate-ref> [--repo <repo-id>] [--story-id <id>] [--pattern-id <id>] --json'
    });
    return ExitCode.Failure;
  }

  try {
    if (target === 'story') {
      const parsedSource = parseSourceRef(sourceRef);
      const parsedRepoId = parsedSource.repoId;
      const repoId = readOption(args, '--repo') ?? parsedRepoId;
      if (!repoId) {
        throw new Error('playbook promote: story promotion requires --repo <repo-id> or a repo/<repo-id>/... source ref');
      }
      const targetRepoRoot = resolveRepoRootById(playbookHome, cwd, repoId);
      const sourceRepoRoot = parsedRepoId ? resolveRepoRootById(playbookHome, cwd, parsedRepoId) : undefined;
      const storyCandidate = parsedSource.kind === 'story'
        ? readStoryCandidatesArtifact(sourceRepoRoot ?? targetRepoRoot).candidates.find((entry) => entry.id === parsedSource.candidateId) ?? null
        : null;
      const patternCandidate = parsedSource.kind !== 'story'
        ? readPatternSource(playbookHome, sourceRef)
        : null;
      const sourceFingerprint = storyCandidate?.candidate_fingerprint
        ?? (patternCandidate ? fingerprintPromotionValue(patternCandidate) : null);
      const targetStoryId = readOption(args, '--story-id') ?? storyCandidate?.id ?? (patternCandidate ? `pattern-${String(patternCandidate.pattern_family ?? parsedSource.candidateId)}` : parsedSource.candidateId);
      const existingStory = readJsonIfPresent<{ stories?: Array<Record<string, unknown>> }>(path.join(targetRepoRoot, '.playbook', 'stories.json'))
        ?.stories?.find((entry) => String(entry.id ?? '') === targetStoryId) ?? null;

      try {
        const prepared = materializeStoryFromSource({
          sourceRef,
          sourceRepoRoot,
          targetRepoId: repoId,
          targetStoryId: readOption(args, '--story-id'),
          targetRepoRoot,
          playbookHome
        });
        const promotion = stageWorkflowArtifact({
          cwd: prepared.targetRoot,
          workflowKind: 'promote-story',
          candidateRelativePath: prepared.stagedRelativePath,
          committedRelativePath: prepared.committedRelativePath,
          artifact: prepared.artifact,
          validate: () => [],
          generatedAt: prepared.record.provenance?.promoted_at,
          successSummary: prepared.noop ? `Promotion no-op for story ${prepared.targetId}` : `Promoted ${prepared.sourceRef} to story ${prepared.targetId}`,
          blockedSummary: `Story promotion blocked for ${prepared.targetId}`
        });
        const receipt = buildPromotionReceipt({
          promotion_kind: 'story',
          source_candidate_ref: sourceRef,
          source_fingerprint: sourceFingerprint ?? prepared.record.provenance?.candidate_fingerprint ?? fingerprintPromotionValue(prepared.record),
          target_artifact_path: prepared.committedRelativePath,
          target_id: prepared.targetId,
          before_fingerprint: existingStory ? fingerprintPromotionValue(existingStory) : null,
          after_fingerprint: fingerprintPromotionValue(prepared.record),
          outcome: prepared.noop ? 'noop' : 'promoted',
          generated_at: prepared.record.provenance?.promoted_at ?? new Date().toISOString()
        });
        const receiptPath = writePromotionReceipt(prepared.targetRoot, receipt);
        print(options.format, {
          schemaVersion: '1.0',
          command: 'promote.story',
          source_ref: sourceRef,
          repo_id: repoId,
          story: prepared.record,
          noop: prepared.noop,
          promotion,
          receipt,
          receipt_artifact_path: path.relative(prepared.targetRoot, receiptPath)
        });
        return ExitCode.Success;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes('conflict for story')) {
          const receipt = buildConflictReceipt({
            promotionKind: 'story',
            sourceRef,
            sourceFingerprint: sourceFingerprint ?? 'unknown',
            targetArtifactPath: '.playbook/stories.json',
            targetId: targetStoryId,
            beforeFingerprint: existingStory ? fingerprintPromotionValue(existingStory) : null
          });
          const receiptPath = writePromotionReceipt(targetRepoRoot, receipt);
          print(options.format, {
            schemaVersion: '1.0',
            command: 'promote.story',
            error: message,
            receipt,
            receipt_artifact_path: path.relative(targetRepoRoot, receiptPath)
          });
          return ExitCode.Failure;
        }
        throw error;
      }
    }

    if (!sourceRef.startsWith('global/pattern-candidates/')) {
      throw new Error('playbook promote: pattern promotion only supports global/pattern-candidates/<candidate-id> sources');
    }
    const parsedSource = parseSourceRef(sourceRef);
    const targetPatternId = readOption(args, '--pattern-id') ?? parsedSource.candidateId;
    const patternCandidate = readPatternSource(playbookHome, sourceRef);
    const existingPattern = readJsonIfPresent<{ patterns?: Array<Record<string, unknown>> }>(path.join(playbookHome, GLOBAL_PATTERNS_RELATIVE_PATH))
      ?.patterns?.find((entry) => String(entry.id ?? '') === targetPatternId) ?? null;
    const sourceFingerprint = fingerprintPromotionValue(patternCandidate);
    try {
      const prepared = materializePatternFromCandidate({
        sourceRef,
        playbookHome,
        targetPatternId: readOption(args, '--pattern-id')
      });
      const promotion = stageWorkflowArtifact({
        cwd: prepared.targetRoot,
        workflowKind: 'promote-pattern',
        candidateRelativePath: prepared.stagedRelativePath,
        committedRelativePath: prepared.committedRelativePath,
        artifact: prepared.artifact,
        validate: () => [],
        generatedAt: prepared.record.provenance.promoted_at,
        successSummary: prepared.noop ? `Promotion no-op for pattern ${prepared.targetId}` : `Promoted ${prepared.sourceRef} to pattern ${prepared.targetId}`,
        blockedSummary: `Pattern promotion blocked for ${prepared.targetId}`
      });
      const receipt = buildPromotionReceipt({
        promotion_kind: 'pattern',
        source_candidate_ref: sourceRef,
        source_fingerprint: sourceFingerprint,
        target_artifact_path: prepared.committedRelativePath,
        target_id: prepared.targetId,
        before_fingerprint: existingPattern ? fingerprintPromotionValue(existingPattern) : null,
        after_fingerprint: fingerprintPromotionValue(prepared.record),
        outcome: prepared.noop ? 'noop' : 'promoted',
        generated_at: prepared.record.provenance.promoted_at
      });
      const receiptPath = writePromotionReceipt(prepared.targetRoot, receipt);
      print(options.format, {
        schemaVersion: '1.0',
        command: 'promote.pattern',
        source_ref: sourceRef,
        pattern: prepared.record,
        noop: prepared.noop,
        artifact_path: GLOBAL_PATTERNS_RELATIVE_PATH,
        promotion,
        receipt,
        receipt_artifact_path: path.relative(prepared.targetRoot, receiptPath)
      });
      return ExitCode.Success;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('conflict for pattern')) {
        const receipt = buildConflictReceipt({
          promotionKind: 'pattern',
          sourceRef,
          sourceFingerprint,
          targetArtifactPath: GLOBAL_PATTERNS_RELATIVE_PATH,
          targetId: targetPatternId,
          beforeFingerprint: existingPattern ? fingerprintPromotionValue(existingPattern) : null
        });
        const receiptPath = writePromotionReceipt(playbookHome, receipt);
        print(options.format, {
          schemaVersion: '1.0',
          command: 'promote.pattern',
          error: message,
          receipt,
          receipt_artifact_path: path.relative(playbookHome, receiptPath)
        });
        return ExitCode.Failure;
      }
      throw error;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    print(options.format, { schemaVersion: '1.0', command: 'promote', error: message });
    return ExitCode.Failure;
  }
};
