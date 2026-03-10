import { createHash } from 'node:crypto';
import type { GraphEdge, GraphGroup, GraphGroupArtifact, GraphGroupingMetrics, GraphSnapshot, GraphVertex, GroupingReason } from '../schema/graphMemory.js';
import { checkVertexCompatibility } from './compatibilityGuards.js';

type CandidateLink = {
  left: string;
  right: string;
  reason: GroupingReason;
  evidenceRef: string;
};

export type GroupDeterministicMemoryInput = {
  snapshot: GraphSnapshot;
  createdAt?: string;
};

const normalize = (value: string): string => value.trim().toLowerCase().replace(/\s+/g, ' ');

const sortPair = (left: string, right: string): [string, string] => (left.localeCompare(right) <= 0 ? [left, right] : [right, left]);

const toStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry): entry is string => typeof entry === 'string');
};

class UnionFind {
  private readonly parent = new Map<string, string>();

  constructor(private readonly ids: string[]) {
    for (const id of ids) {
      this.parent.set(id, id);
    }
  }

  find(id: string): string {
    const parent = this.parent.get(id);
    if (!parent || parent === id) {
      return id;
    }
    const root = this.find(parent);
    this.parent.set(id, root);
    return root;
  }

  union(left: string, right: string): void {
    const leftRoot = this.find(left);
    const rightRoot = this.find(right);
    if (leftRoot === rightRoot) {
      return;
    }
    if (leftRoot.localeCompare(rightRoot) <= 0) {
      this.parent.set(rightRoot, leftRoot);
      return;
    }
    this.parent.set(leftRoot, rightRoot);
  }

  components(): Map<string, string[]> {
    const grouped = new Map<string, string[]>();
    for (const id of this.ids) {
      const root = this.find(id);
      const entries = grouped.get(root) ?? [];
      entries.push(id);
      grouped.set(root, entries);
    }
    return grouped;
  }
}

const createGroupId = (cycleId: string, memberVertexIds: string[]): string => {
  const digest = createHash('sha256').update(cycleId).update('|').update(memberVertexIds.join('|')).digest('hex').slice(0, 12);
  return `group:${cycleId}:${digest}`;
};

const collectReasonLinks = (snapshot: GraphSnapshot, zettels: GraphVertex[]): CandidateLink[] => {
  const links: CandidateLink[] = [];
  const addLink = (left: string, right: string, reason: GroupingReason, evidenceRef: string): void => {
    if (left === right) {
      return;
    }
    const [from, to] = sortPair(left, right);
    links.push({ left: from, right: to, reason, evidenceRef });
  };

  const byCanonical = new Map<string, string[]>();
  const bySubject = new Map<string, string[]>();
  const byContractRef = new Map<string, string[]>();
  const byArtifactRef = new Map<string, string[]>();

  for (const vertex of zettels) {
    if (vertex.canonicalKey) {
      const entries = byCanonical.get(vertex.canonicalKey) ?? [];
      entries.push(vertex.id);
      byCanonical.set(vertex.canonicalKey, entries);
    }

    if (typeof vertex.metadata.subject === 'string') {
      const normalized = normalize(vertex.metadata.subject);
      const entries = bySubject.get(normalized) ?? [];
      entries.push(vertex.id);
      bySubject.set(normalized, entries);
    }

    for (const contractRef of toStringArray(vertex.metadata.contractRefs)) {
      const entries = byContractRef.get(contractRef) ?? [];
      entries.push(vertex.id);
      byContractRef.set(contractRef, entries);
    }

    const artifactRefs = toStringArray(vertex.metadata.artifactRefs);
    if (vertex.sourceArtifactPath) {
      artifactRefs.push(vertex.sourceArtifactPath);
    }
    for (const artifactRef of artifactRefs) {
      const entries = byArtifactRef.get(artifactRef) ?? [];
      entries.push(vertex.id);
      byArtifactRef.set(artifactRef, entries);
    }
  }

  const createLinksFromBuckets = (buckets: Map<string, string[]>, reason: GroupingReason): void => {
    for (const [token, ids] of buckets.entries()) {
      const sorted = [...new Set(ids)].sort((left, right) => left.localeCompare(right));
      for (let index = 0; index < sorted.length - 1; index += 1) {
        addLink(sorted[index] as string, sorted[index + 1] as string, reason, `${reason}:${token}`);
      }
    }
  };

  createLinksFromBuckets(byCanonical, 'exact_canonical_key');
  createLinksFromBuckets(bySubject, 'exact_normalized_subject');
  createLinksFromBuckets(byContractRef, 'shared_contract_ref');
  createLinksFromBuckets(byArtifactRef, 'shared_artifact_ref');

  const zettelIds = new Set(zettels.map((vertex) => vertex.id));
  const typedNeighborKinds = new Set(['SUPPORTS', 'DERIVES', 'MEMBER_OF', 'APPLIES_TO', 'VIOLATES', 'CITES']);
  const neighborsByZettel = new Map<string, Set<string>>();

  for (const edge of snapshot.edges) {
    if (!typedNeighborKinds.has(edge.kind)) {
      continue;
    }
    if (zettelIds.has(edge.from) && !zettelIds.has(edge.to)) {
      const entries = neighborsByZettel.get(edge.from) ?? new Set<string>();
      entries.add(edge.to);
      neighborsByZettel.set(edge.from, entries);
    }
    if (zettelIds.has(edge.to) && !zettelIds.has(edge.from)) {
      const entries = neighborsByZettel.get(edge.to) ?? new Set<string>();
      entries.add(edge.from);
      neighborsByZettel.set(edge.to, entries);
    }
  }

  const zettelList = [...zettelIds].sort((left, right) => left.localeCompare(right));
  for (let i = 0; i < zettelList.length; i += 1) {
    for (let j = i + 1; j < zettelList.length; j += 1) {
      const left = zettelList[i] as string;
      const right = zettelList[j] as string;
      const leftNeighbors = neighborsByZettel.get(left);
      const rightNeighbors = neighborsByZettel.get(right);
      if (!leftNeighbors || !rightNeighbors) {
        continue;
      }
      const overlap = [...leftNeighbors].find((neighbor) => rightNeighbors.has(neighbor));
      if (overlap) {
        addLink(left, right, 'typed_connectivity', `typed_connectivity:${overlap}`);
      }
    }
  }

  return links;
};

const collectComponentEvidence = (componentIds: Set<string>, edges: GraphEdge[]): string[] => {
  const refs = new Set<string>();
  for (const edge of edges) {
    if (!componentIds.has(edge.from) && !componentIds.has(edge.to)) {
      continue;
    }
    for (const ref of edge.evidenceRefs) {
      refs.add(ref);
    }
  }
  return [...refs].sort((left, right) => left.localeCompare(right));
};

const REASON_PRIORITY: GroupingReason[] = [
  'exact_canonical_key',
  'exact_normalized_subject',
  'shared_contract_ref',
  'shared_artifact_ref',
  'typed_connectivity'
];

const reasonPriority = (reason: GroupingReason): number => REASON_PRIORITY.indexOf(reason);

export const groupDeterministicMemory = ({ snapshot, createdAt }: GroupDeterministicMemoryInput): GraphGroupArtifact => {
  const zettels = snapshot.vertices.filter((vertex): vertex is GraphVertex => vertex.kind === 'Zettel');
  const zettelsById = new Map(zettels.map((vertex) => [vertex.id, vertex]));

  const candidateLinks = collectReasonLinks(snapshot, zettels).sort((left, right) => {
    return (
      reasonPriority(left.reason) - reasonPriority(right.reason) ||
      left.left.localeCompare(right.left) ||
      left.right.localeCompare(right.right) ||
      left.evidenceRef.localeCompare(right.evidenceRef)
    );
  });

  const groupedReasonsByPair = new Map<string, Set<GroupingReason>>();
  const boundaryFlagsByPair = new Map<string, Set<GraphGroup['boundaryFlags'][number]>>();

  const uf = new UnionFind(zettels.map((vertex) => vertex.id));

  for (const link of candidateLinks) {
    const leftVertex = zettelsById.get(link.left);
    const rightVertex = zettelsById.get(link.right);
    if (!leftVertex || !rightVertex) {
      continue;
    }

    const pairKey = `${link.left}::${link.right}`;
    const reasons = groupedReasonsByPair.get(pairKey) ?? new Set<GroupingReason>();
    reasons.add(link.reason);
    groupedReasonsByPair.set(pairKey, reasons);

    const compatibility = checkVertexCompatibility(leftVertex, rightVertex);
    if (!compatibility.compatible) {
      const boundaryFlags = boundaryFlagsByPair.get(pairKey) ?? new Set();
      for (const flag of compatibility.boundaryFlags) {
        boundaryFlags.add(flag);
      }
      boundaryFlagsByPair.set(pairKey, boundaryFlags);
      continue;
    }

    uf.union(link.left, link.right);
  }

  const components = [...uf.components().values()].map((component) => [...component].sort((a, b) => a.localeCompare(b)));
  components.sort((left, right) => left[0]!.localeCompare(right[0]!));

  let boundaryConflictCount = 0;
  let crossContractConflictCount = 0;

  const groups: GraphGroup[] = components.map((componentVertexIds) => {
    const componentSet = new Set(componentVertexIds);
    const componentZettels = componentVertexIds.map((id) => zettelsById.get(id)).filter((entry): entry is GraphVertex => Boolean(entry));

    const reasonSet = new Set<GroupingReason>();
    const boundarySet = new Set<GraphGroup['boundaryFlags'][number]>();

    for (let i = 0; i < componentVertexIds.length; i += 1) {
      for (let j = i + 1; j < componentVertexIds.length; j += 1) {
        const [left, right] = sortPair(componentVertexIds[i] as string, componentVertexIds[j] as string);
        const pairKey = `${left}::${right}`;
        const reasons = groupedReasonsByPair.get(pairKey);
        if (reasons) {
          for (const reason of reasons) {
            reasonSet.add(reason);
          }
        }
        const flags = boundaryFlagsByPair.get(pairKey);
        if (flags) {
          for (const flag of flags) {
            boundarySet.add(flag);
          }
        }
      }
    }

    const sharedCanonicalKey = (() => {
      const keys = componentZettels.map((vertex) => vertex.canonicalKey).filter((key): key is string => typeof key === 'string');
      if (keys.length === 0) {
        return undefined;
      }
      const unique = [...new Set(keys)];
      if (unique.length === 1) {
        return unique[0];
      }
      return undefined;
    })();

    const contractRefs = new Set<string>();
    for (const vertex of componentZettels) {
      for (const contractRef of toStringArray(vertex.metadata.contractRefs)) {
        contractRefs.add(contractRef);
      }
    }

    const compatibilityStatus = boundarySet.size > 0 ? 'rejected' : 'compatible';
    if (boundarySet.size > 0) {
      boundaryConflictCount += 1;
    }
    if (boundarySet.has('cross_contract_conflict')) {
      crossContractConflictCount += 1;
    }

    const evidenceRefs = collectComponentEvidence(componentSet, snapshot.edges);
    const evidenceCount = evidenceRefs.length;
    const confidence = componentVertexIds.length <= 1 ? 0.5 : Math.min(0.99, 0.6 + reasonSet.size * 0.08 + Math.min(0.2, evidenceCount * 0.01));

    return {
      groupId: createGroupId(snapshot.cycleId, componentVertexIds),
      originCycleId: snapshot.cycleId,
      memberVertexIds: componentVertexIds,
      memberZettelIds: componentVertexIds,
      groupingReasons: [...reasonSet].sort((left, right) => reasonPriority(left) - reasonPriority(right)),
      compatibilityStatus,
      boundaryFlags: [...boundarySet].sort((left, right) => left.localeCompare(right)),
      sharedCanonicalKey,
      sharedContractRefs: [...contractRefs].sort((left, right) => left.localeCompare(right)),
      evidenceCount,
      confidence
    };
  });

  const componentSizes = groups.map((group) => group.memberZettelIds.length);
  const singletonComponentCount = componentSizes.filter((size) => size === 1).length;
  const componentCount = groups.length;
  const largestComponentSize = componentSizes.length > 0 ? Math.max(...componentSizes) : 0;
  const avgComponentSize = componentCount === 0 ? 0 : componentSizes.reduce((sum, size) => sum + size, 0) / componentCount;
  const groupableZettelCount = groups.filter((group) => group.memberZettelIds.length > 1).reduce((sum, group) => sum + group.memberZettelIds.length, 0);
  const candidatePatternCount = groups.filter((group) => group.compatibilityStatus === 'compatible' && group.memberZettelIds.length > 1).length;
  const contractionRatio = zettels.length === 0 ? 0 : candidatePatternCount / zettels.length;
  const orphanRate = zettels.length === 0 ? 0 : singletonComponentCount / zettels.length;

  const metrics: GraphGroupingMetrics = {
    componentCount,
    singletonComponentCount,
    largestComponentSize,
    avgComponentSize,
    groupableZettelCount,
    candidatePatternCount,
    contractionRatio,
    orphanRate,
    boundaryConflictCount,
    crossContractConflictCount
  };

  const artifactCreatedAt = createdAt ?? new Date().toISOString();
  const artifactId = `groups:${snapshot.cycleId}:${createHash('sha256').update(snapshot.snapshotId).update('|').update(artifactCreatedAt).digest('hex').slice(0, 12)}`;

  return {
    schemaVersion: '1.0',
    kind: 'playbook-graph-groups',
    artifactId,
    snapshotId: snapshot.snapshotId,
    cycleId: snapshot.cycleId,
    createdAt: artifactCreatedAt,
    groups,
    metrics
  };
};
