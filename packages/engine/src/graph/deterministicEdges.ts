import { createHash } from 'node:crypto';
import type { EdgeKind, GraphEdge, GraphVertex } from '../schema/graphMemory.js';

export type EdgeSeed = {
  kind: EdgeKind;
  from: string;
  to: string;
  originCycleId: string;
  evidenceRefs: string[];
};

const stableEdgeId = (seed: EdgeSeed): string => {
  const hash = createHash('sha256')
    .update(seed.kind)
    .update('|')
    .update(seed.from)
    .update('|')
    .update(seed.to)
    .update('|')
    .update(seed.originCycleId)
    .update('|')
    .update(seed.evidenceRefs.slice().sort((left, right) => left.localeCompare(right)).join(','))
    .digest('hex')
    .slice(0, 16);
  return `edge:${hash}`;
};

const sortEdges = (edges: GraphEdge[]): GraphEdge[] =>
  [...edges].sort((left, right) =>
    left.kind.localeCompare(right.kind) ||
    left.from.localeCompare(right.from) ||
    left.to.localeCompare(right.to) ||
    left.id.localeCompare(right.id)
  );

export const materializeDeterministicEdges = (seeds: EdgeSeed[]): GraphEdge[] => {
  const deduped = new Map<string, GraphEdge>();

  for (const seed of seeds) {
    if (seed.from === seed.to) {
      continue;
    }

    const evidenceRefs = Array.from(new Set(seed.evidenceRefs)).sort((left, right) => left.localeCompare(right));
    const canonical = {
      ...seed,
      evidenceRefs
    };

    const dedupeKey = `${canonical.kind}|${canonical.from}|${canonical.to}|${canonical.originCycleId}|${evidenceRefs.join(',')}`;
    if (deduped.has(dedupeKey)) {
      continue;
    }

    deduped.set(dedupeKey, {
      id: stableEdgeId(canonical),
      kind: canonical.kind,
      from: canonical.from,
      to: canonical.to,
      originCycleId: canonical.originCycleId,
      evidenceRefs
    });
  }

  return sortEdges(Array.from(deduped.values()));
};

export const countOrphanVertices = (vertices: GraphVertex[], edges: GraphEdge[]): number => {
  const connected = new Set<string>();
  for (const edge of edges) {
    connected.add(edge.from);
    connected.add(edge.to);
  }
  return vertices.filter((vertex) => !connected.has(vertex.id)).length;
};
