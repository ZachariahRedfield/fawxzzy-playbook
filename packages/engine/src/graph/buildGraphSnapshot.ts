import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { PatternCard } from '../compaction/patternCardTypes.js';
import type { GraphSnapshot, GraphVertex } from '../schema/graphMemory.js';
import type { RunCycle, RunCycleArtifactRef } from '../schema/runCycle.js';
import { materializeDeterministicEdges, type EdgeSeed, countOrphanVertices } from './deterministicEdges.js';

type ZettelRecord = {
  id?: string;
  zettelId?: string;
  createdAt?: string;
  title?: string;
  subject?: string;
  canonicalKey?: string;
  originCycleId?: string;
  sourceArtifactPath?: string;
  evidence?: Array<{ path?: string; pointer?: string; digest?: string }>;
  evidenceRef?: string;
  links?: Array<{ relation?: string; targetPatternId?: string; targetContractId?: string }>;
  promotedPatternId?: string | null;
  contractId?: string;
  appliesToContractId?: string;
  violatesContractId?: string;
  contractRefs?: string[];
  metadata?: Record<string, unknown>;
};

type ContractRecord = {
  contractId?: string;
  id?: string;
  promotedFromPatternId?: string;
  canonicalKey?: string;
};

export type BuildGraphSnapshotInput = {
  projectRoot: string;
  runCycle: RunCycle;
  createdAt?: string;
};

const readJson = <T>(absolutePath: string): T | undefined => {
  if (!fs.existsSync(absolutePath)) {
    return undefined;
  }
  return JSON.parse(fs.readFileSync(absolutePath, 'utf8')) as T;
};

const readJsonl = <T>(absolutePath: string): T[] => {
  if (!fs.existsSync(absolutePath)) {
    return [];
  }

  return fs
    .readFileSync(absolutePath, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as T);
};

const normalizeSubject = (value: string): string => value.trim().toLowerCase().replace(/\s+/g, ' ');

const idFromArtifactPath = (artifactPath: string): string =>
  `artifact:${artifactPath.replace(/^\.\//, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/(^-|-$)/g, '').toLowerCase()}`;

const toVertex = (vertex: GraphVertex): GraphVertex => vertex;

const toEvidenceRef = (ref: RunCycleArtifactRef): string => `path:${ref.path}${ref.digest ? `#${ref.digest}` : ''}`;

export const buildGraphSnapshot = ({ projectRoot, runCycle, createdAt }: BuildGraphSnapshotInput): GraphSnapshot => {
  const cycleId = runCycle.runCycleId;
  const snapshotCreatedAt = createdAt ?? new Date().toISOString();
  const snapshotHash = createHash('sha256').update(cycleId).update('|').update(snapshotCreatedAt).digest('hex').slice(0, 16);
  const snapshotId = `graph:${cycleId}:${snapshotHash}`;

  const vertices: GraphVertex[] = [];
  const edgeSeeds: EdgeSeed[] = [];

  const vertexIds = new Set<string>();
  const artifactVertexByPath = new Map<string, GraphVertex>();
  const patternVertexById = new Map<string, GraphVertex>();
  const contractVertexById = new Map<string, GraphVertex>();

  const addVertex = (vertex: GraphVertex): GraphVertex => {
    if (vertexIds.has(vertex.id)) {
      return vertices.find((entry) => entry.id === vertex.id) as GraphVertex;
    }
    vertexIds.add(vertex.id);
    vertices.push(vertex);
    return vertex;
  };

  const cycleVertexId = `cycle:${cycleId}`;
  addVertex(
    toVertex({
      id: cycleVertexId,
      kind: 'RunCycle',
      status: 'working',
      originCycleId: cycleId,
      sourceArtifactPath: `.playbook/run-cycles/${cycleId}.json`,
      canonicalKey: `run-cycle:${cycleId}`,
      evidenceCount: 1,
      entropyCost: 0,
      metadata: {
        createdAt: runCycle.createdAt
      }
    })
  );

  const runCycleArtifacts: RunCycleArtifactRef[] = [
    runCycle.forwardArc.aiContext,
    runCycle.forwardArc.aiContract,
    runCycle.forwardArc.repoIndex,
    runCycle.forwardArc.repoGraph,
    runCycle.returnArc.verify,
    runCycle.returnArc.plan,
    runCycle.returnArc.apply,
    runCycle.returnArc.postVerify,
    runCycle.zettelkasten.zettels,
    runCycle.zettelkasten.links,
    runCycle.stateSpace?.bloch
  ].filter((entry): entry is RunCycleArtifactRef => Boolean(entry));

  for (const artifact of runCycleArtifacts) {
    const vertex = addVertex(
      toVertex({
        id: idFromArtifactPath(artifact.path),
        kind: 'Artifact',
        status: 'working',
        originCycleId: cycleId,
        sourceArtifactPath: artifact.path,
        canonicalKey: `artifact:${artifact.path}`,
        evidenceCount: artifact.digest ? 1 : 0,
        entropyCost: 0,
        metadata: artifact.digest ? { digest: artifact.digest } : {}
      })
    );
    artifactVertexByPath.set(artifact.path, vertex);
    edgeSeeds.push({
      kind: 'PRODUCED',
      from: cycleVertexId,
      to: vertex.id,
      originCycleId: cycleId,
      evidenceRefs: [toEvidenceRef(artifact)]
    });
  }

  const zettelsPath = runCycle.zettelkasten.zettels?.path ? path.join(projectRoot, runCycle.zettelkasten.zettels.path) : null;
  const zettels = zettelsPath ? readJsonl<ZettelRecord>(zettelsPath) : [];

  const patternCardsPath = path.join(projectRoot, '.playbook/pattern-cards.json');
  const patternCards = readJson<PatternCard[]>(patternCardsPath) ?? [];

  const promotedContractsPath = path.join(projectRoot, '.playbook/promoted-contracts.json');
  const promotedContracts = readJson<ContractRecord[]>(promotedContractsPath) ?? [];

  const zettelVertexIds: string[] = [];

  for (const zettel of zettels) {
    const zettelId = zettel.id ?? zettel.zettelId;
    if (!zettelId) {
      continue;
    }
    const sourceArtifactPath = zettel.sourceArtifactPath ?? runCycle.zettelkasten.zettels?.path;
    const canonicalKey = zettel.canonicalKey ?? `zettel:${normalizeSubject(zettel.title ?? zettelId)}`;
    const evidenceCount = (zettel.evidence?.length ?? 0) + (zettel.evidenceRef ? 1 : 0);

    const zettelVertex = addVertex(
      toVertex({
        id: zettelId,
        kind: 'Zettel',
        status: 'converging',
        originCycleId: zettel.originCycleId ?? cycleId,
        sourceArtifactPath,
        canonicalKey,
        evidenceCount,
        entropyCost: 0,
        metadata: {
          title: zettel.title,
          subject: zettel.subject,
          ...(zettel.metadata ?? {})
        }
      })
    );
    zettelVertexIds.push(zettelVertex.id);

    edgeSeeds.push({
      kind: 'PRODUCED',
      from: cycleVertexId,
      to: zettelVertex.id,
      originCycleId: cycleId,
      evidenceRefs: [sourceArtifactPath ? `source:${sourceArtifactPath}` : 'source:zettelkasten']
    });

    for (const evidence of zettel.evidence ?? []) {
      if (!evidence.path) {
        continue;
      }
      const artifactVertex = artifactVertexByPath.get(evidence.path);
      if (!artifactVertex) {
        continue;
      }
      edgeSeeds.push({
        kind: 'CITES',
        from: zettelVertex.id,
        to: artifactVertex.id,
        originCycleId: cycleId,
        evidenceRefs: [`evidence:${evidence.path}${evidence.pointer ? `#${evidence.pointer}` : ''}`]
      });
    }

    const deterministicPatternId = zettel.promotedPatternId ?? zettel.links?.find((link) => link.targetPatternId)?.targetPatternId;
    if (deterministicPatternId) {
      const patternVertex = patternVertexById.get(deterministicPatternId) ??
        addVertex(
          toVertex({
            id: deterministicPatternId,
            kind: 'PatternCard',
            status: 'contracted',
            originCycleId: cycleId,
            canonicalKey: `pattern:${deterministicPatternId}`,
            evidenceCount: 1,
            entropyCost: 0,
            metadata: {}
          })
        );
      patternVertexById.set(deterministicPatternId, patternVertex);

      edgeSeeds.push({
        kind: 'SUPPORTS',
        from: zettelVertex.id,
        to: patternVertex.id,
        originCycleId: cycleId,
        evidenceRefs: [
          'link:promotedPatternId',
          sourceArtifactPath ? `source:${sourceArtifactPath}` : 'source:zettelkasten'
        ]
      });

      edgeSeeds.push({
        kind: 'MEMBER_OF',
        from: zettelVertex.id,
        to: patternVertex.id,
        originCycleId: cycleId,
        evidenceRefs: [
          'group:exact-pattern-id',
          sourceArtifactPath ? `source:${sourceArtifactPath}` : 'source:zettelkasten'
        ]
      });
    }

    const contractIds = new Set<string>([
      ...(zettel.contractId ? [zettel.contractId] : []),
      ...(zettel.appliesToContractId ? [zettel.appliesToContractId] : []),
      ...(zettel.violatesContractId ? [zettel.violatesContractId] : []),
      ...(zettel.contractRefs ?? []),
      ...((zettel.links ?? []).map((link) => link.targetContractId).filter((value): value is string => Boolean(value)))
    ]);

    for (const contractId of contractIds) {
      const contractVertex = contractVertexById.get(contractId) ??
        addVertex(
          toVertex({
            id: contractId,
            kind: 'Contract',
            status: 'promoted',
            originCycleId: cycleId,
            canonicalKey: `contract:${contractId}`,
            evidenceCount: 1,
            entropyCost: 0,
            metadata: {}
          })
        );
      contractVertexById.set(contractId, contractVertex);

      const relationKind = zettel.violatesContractId === contractId ? 'VIOLATES' : 'APPLIES_TO';
      edgeSeeds.push({
        kind: relationKind,
        from: zettelVertex.id,
        to: contractVertex.id,
        originCycleId: cycleId,
        evidenceRefs: [
          'link:contract-ref',
          sourceArtifactPath ? `source:${sourceArtifactPath}` : 'source:zettelkasten'
        ]
      });
    }
  }

  for (const card of patternCards) {
    const existing = patternVertexById.get(card.patternId);
    if (!existing) {
      const vertex = addVertex(
        toVertex({
          id: card.patternId,
          kind: 'PatternCard',
          status: card.promotionState === 'promoted' ? 'promoted' : 'contracted',
          originCycleId: cycleId,
          canonicalKey: card.patternId,
          evidenceCount: card.evidence.length,
          entropyCost: 0,
          metadata: {
            sourceArtifactPath: '.playbook/pattern-cards.json'
          }
        })
      );
      patternVertexById.set(card.patternId, vertex);
    }
  }

  for (const contract of promotedContracts) {
    const contractId = contract.contractId ?? contract.id;
    if (!contractId) {
      continue;
    }
    const contractVertex = contractVertexById.get(contractId) ??
      addVertex(
        toVertex({
          id: contractId,
          kind: 'Contract',
          status: 'promoted',
          originCycleId: cycleId,
          canonicalKey: contract.canonicalKey ?? `contract:${contractId}`,
          evidenceCount: 1,
          entropyCost: 0,
          metadata: {
            sourceArtifactPath: '.playbook/promoted-contracts.json'
          }
        })
      );
    contractVertexById.set(contractId, contractVertex);

    if (contract.promotedFromPatternId && patternVertexById.has(contract.promotedFromPatternId)) {
      edgeSeeds.push({
        kind: 'PROMOTES_TO',
        from: contract.promotedFromPatternId,
        to: contractId,
        originCycleId: cycleId,
        evidenceRefs: ['promotion:promoted-from-pattern-id']
      });
    }
  }

  for (const artifact of runCycleArtifacts) {
    if (!artifact.path.includes('contract') || !artifact.path.endsWith('.json')) {
      continue;
    }

    const contractId = `contract:${path.basename(artifact.path, '.json')}`;
    const contractVertex = contractVertexById.get(contractId) ??
      addVertex(
        toVertex({
          id: contractId,
          kind: 'Contract',
          status: 'promoted',
          originCycleId: cycleId,
          sourceArtifactPath: artifact.path,
          canonicalKey: contractId,
          evidenceCount: 1,
          entropyCost: 0,
          metadata: {}
        })
      );
    contractVertexById.set(contractId, contractVertex);

    const artifactVertex = artifactVertexByPath.get(artifact.path);
    if (artifactVertex) {
      edgeSeeds.push({
        kind: 'APPLIES_TO',
        from: artifactVertex.id,
        to: contractVertex.id,
        originCycleId: cycleId,
        evidenceRefs: [toEvidenceRef(artifact)]
      });
    }
  }

  const byCanonical = new Map<string, string[]>();
  const bySubject = new Map<string, string[]>();
  for (const vertex of vertices) {
    if (vertex.kind !== 'Zettel' && vertex.kind !== 'Artifact') {
      continue;
    }

    if (vertex.canonicalKey) {
      const list = byCanonical.get(vertex.canonicalKey) ?? [];
      list.push(vertex.id);
      byCanonical.set(vertex.canonicalKey, list);
    }

    const subject = typeof vertex.metadata.subject === 'string' ? normalizeSubject(vertex.metadata.subject) : undefined;
    if (subject) {
      const list = bySubject.get(subject) ?? [];
      list.push(vertex.id);
      bySubject.set(subject, list);
    }
  }

  const addSimilarEdges = (groups: Map<string, string[]>, basis: string): void => {
    for (const [group, ids] of groups.entries()) {
      if (ids.length < 2) {
        continue;
      }
      const ordered = [...ids].sort((left, right) => left.localeCompare(right));
      for (let index = 0; index < ordered.length - 1; index += 1) {
        const from = ordered[index] as string;
        const to = ordered[index + 1] as string;
        edgeSeeds.push({
          kind: 'SIMILAR_TO',
          from,
          to,
          originCycleId: cycleId,
          evidenceRefs: [`similarity:${basis}:${group}`]
        });
      }
    }
  };

  addSimilarEdges(byCanonical, 'canonicalKey');
  addSimilarEdges(bySubject, 'subject');

  const sortedVertices = [...vertices].sort((left, right) =>
    left.kind.localeCompare(right.kind) || left.id.localeCompare(right.id)
  );
  const edges = materializeDeterministicEdges(edgeSeeds);

  const zettelIdSet = new Set(zettelVertexIds);
  const linkedZettelIds = new Set<string>();
  for (const edge of edges) {
    if (edge.kind === 'PRODUCED') {
      continue;
    }
    if (zettelIdSet.has(edge.from)) {
      linkedZettelIds.add(edge.from);
    }
    if (zettelIdSet.has(edge.to)) {
      linkedZettelIds.add(edge.to);
    }
  }

  return {
    snapshotId,
    cycleId,
    createdAt: snapshotCreatedAt,
    vertices: sortedVertices,
    edges,
    metrics: {
      vertexCount: sortedVertices.length,
      edgeCount: edges.length,
      orphanVertexCount: countOrphanVertices(sortedVertices, edges),
      zettelCount: zettelVertexIds.length,
      linkedZettelCount: linkedZettelIds.size,
      patternCardCount: sortedVertices.filter((vertex) => vertex.kind === 'PatternCard').length,
      contractCount: sortedVertices.filter((vertex) => vertex.kind === 'Contract').length
    }
  };
};
