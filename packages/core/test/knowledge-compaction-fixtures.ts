import { compactCandidate, createCandidate } from '../src/knowledge/knowledge-lifecycle.js';
import type { KnowledgeCandidate, KnowledgeCompacted } from '../src/knowledge/knowledge-types.js';

const evidence = [{ type: 'observation', source: 'tests/knowledge/compaction-fixtures.ts', timestamp: 1711000000000 }] as const;

export const makeCandidate = (overrides: Partial<KnowledgeCandidate> & Pick<KnowledgeCandidate, 'canonicalKey' | 'canonicalShape'>): KnowledgeCandidate =>
  createCandidate({
    canonicalKey: overrides.canonicalKey,
    canonicalShape: overrides.canonicalShape,
    createdAt: overrides.createdAt ?? 1711000001000,
    evidence: overrides.evidence ?? [...evidence]
  });

export const existingCompactedArtifactsFixture: KnowledgeCompacted[] = [
  compactCandidate(
    makeCandidate({
      canonicalKey: 'pattern:local-cli-bootstrap',
      canonicalShape: {
        mechanism: 'run pnpm -r build before local cli commands',
        tags: ['cli', 'bootstrap']
      }
    }),
    { compactedAt: 1711000002000 }
  ),
  compactCandidate(
    makeCandidate({
      canonicalKey: 'pattern:deterministic-remediation-loop',
      canonicalShape: {
        mechanism: 'run verify plan apply verify in sequence',
        tags: ['governance', 'workflow']
      }
    }),
    { compactedAt: 1711000002001 }
  )
];

export const discardCandidateFixture = makeCandidate({
  canonicalKey: 'PATTERN:LOCAL-CLI-BOOTSTRAP',
  canonicalShape: {
    mechanism: ' Run PNPM -r build before local CLI commands ',
    tags: ['bootstrap', 'cli']
  }
});

export const attachEvidenceCandidateFixture = makeCandidate({
  canonicalKey: 'PATTERN:LOCAL-CLI-BOOTSTRAP',
  canonicalShape: {
    mechanism: 'run pnpm -r build before local cli commands with additional governance context',
    tags: ['cli', 'bootstrap']
  }
});

export const mergeVariantCandidateFixture = makeCandidate({
  canonicalKey: 'pattern:cli-build-first-wording-variant',
  canonicalShape: {
    mechanism: 'run pnpm -r build before local cli commands',
    tags: ['bootstrap', 'cli']
  }
});

export const newPatternCandidateFixture = makeCandidate({
  canonicalKey: 'pattern:docs-audit-governance',
  canonicalShape: {
    mechanism: 'run docs audit for governance and documentation edits',
    tags: ['docs', 'governance']
  }
});
