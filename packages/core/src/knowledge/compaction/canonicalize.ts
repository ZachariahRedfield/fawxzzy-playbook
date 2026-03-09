import { serializeCanonicalKnowledgeShape } from '../knowledge-id.js';
import type { KnowledgeArtifactBase, KnowledgeCanonicalShape } from '../knowledge-types.js';
import type { KnowledgeLifecycleState } from '../knowledge-lifecycle.js';
import type { CanonicalKnowledgeRecord } from './compaction-types.js';

const normalizeText = (value: string): string => value.replace(/\s+/g, ' ').trim().toLowerCase();

const normalizePrimitive = (value: unknown): unknown => {
  if (typeof value === 'string') return normalizeText(value);
  return value;
};

const isPrimitiveArray = (value: unknown[]): boolean => value.every((item) => item === null || ['string', 'number', 'boolean'].includes(typeof item));

const normalizeShapeValue = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    const normalizedEntries = value.map((entry) => normalizeShapeValue(entry));
    if (isPrimitiveArray(normalizedEntries)) {
      return [...new Set(normalizedEntries.map((entry) => JSON.stringify(entry)))].sort().map((entry) => JSON.parse(entry) as unknown);
    }
    return normalizedEntries
      .map((entry) => ({ entry, key: JSON.stringify(entry) }))
      .sort((a, b) => a.key.localeCompare(b.key))
      .map((entry) => entry.entry);
  }

  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      result[key] = normalizeShapeValue((value as Record<string, unknown>)[key]);
    }
    return result;
  }

  return normalizePrimitive(value);
};

export const canonicalizeKnowledgeShape = (shape: KnowledgeCanonicalShape): KnowledgeCanonicalShape =>
  normalizeShapeValue(shape) as KnowledgeCanonicalShape;

export const canonicalizeCanonicalKey = (canonicalKey: string): string => normalizeText(canonicalKey);

export const canonicalizeKnowledgeRecord = (artifact: KnowledgeArtifactBase<KnowledgeLifecycleState>): CanonicalKnowledgeRecord => {
  const canonicalKey = canonicalizeCanonicalKey(artifact.canonicalKey);
  const canonicalShape = canonicalizeKnowledgeShape(artifact.canonicalShape);
  const canonicalRepresentation = serializeCanonicalKnowledgeShape(canonicalShape);
  return {
    artifactId: artifact.id,
    canonicalKey,
    canonicalRepresentation
  };
};
