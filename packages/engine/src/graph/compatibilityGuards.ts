import type { GraphVertex } from '../schema/graphMemory.js';

export const GROUP_BOUNDARY_FLAGS = [
  'cross_contract_conflict',
  'invariant_conflict',
  'mechanism_conflict',
  'subject_domain_conflict'
] as const;

export type GroupBoundaryFlag = (typeof GROUP_BOUNDARY_FLAGS)[number];

export type CompatibilityGuardResult = {
  compatible: boolean;
  boundaryFlags: GroupBoundaryFlag[];
};

const normalize = (value: string): string => value.trim().toLowerCase().replace(/\s+/g, ' ');

const toStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry): entry is string => typeof entry === 'string').map((entry) => normalize(entry));
};

const parseInvariantPolarity = (value: string): { key: string; polarity: 'positive' | 'negative' } => {
  const normalized = normalize(value);
  if (normalized.startsWith('not ')) {
    return { key: normalized.slice(4), polarity: 'negative' };
  }
  if (normalized.startsWith('no ')) {
    return { key: normalized.slice(3), polarity: 'negative' };
  }
  return { key: normalized, polarity: 'positive' };
};

const hasContractConflict = (left: GraphVertex, right: GraphVertex): boolean => {
  const leftContracts = new Set(toStringArray(left.metadata.contractRefs));
  const rightContracts = new Set(toStringArray(right.metadata.contractRefs));
  if (leftContracts.size === 0 || rightContracts.size === 0) {
    return false;
  }
  for (const contractRef of leftContracts) {
    if (rightContracts.has(contractRef)) {
      return false;
    }
  }
  return true;
};

const hasInvariantConflict = (left: GraphVertex, right: GraphVertex): boolean => {
  const leftInvariant = typeof left.metadata.invariant === 'string' ? parseInvariantPolarity(left.metadata.invariant) : undefined;
  const rightInvariant = typeof right.metadata.invariant === 'string' ? parseInvariantPolarity(right.metadata.invariant) : undefined;

  if (!leftInvariant || !rightInvariant) {
    return false;
  }

  return leftInvariant.key === rightInvariant.key && leftInvariant.polarity !== rightInvariant.polarity;
};

const hasMechanismConflict = (left: GraphVertex, right: GraphVertex): boolean => {
  const leftMechanism = typeof left.metadata.mechanism === 'string' ? normalize(left.metadata.mechanism) : undefined;
  const rightMechanism = typeof right.metadata.mechanism === 'string' ? normalize(right.metadata.mechanism) : undefined;

  if (!leftMechanism || !rightMechanism) {
    return false;
  }

  return leftMechanism !== rightMechanism;
};

const hasSubjectDomainConflict = (left: GraphVertex, right: GraphVertex): boolean => {
  const leftDomain = typeof left.metadata.subjectDomain === 'string' ? normalize(left.metadata.subjectDomain) : undefined;
  const rightDomain = typeof right.metadata.subjectDomain === 'string' ? normalize(right.metadata.subjectDomain) : undefined;
  const leftAllowCrossDomain = left.metadata.allowCrossDomainMerge === true;
  const rightAllowCrossDomain = right.metadata.allowCrossDomainMerge === true;

  if (!leftDomain || !rightDomain || leftAllowCrossDomain || rightAllowCrossDomain) {
    return false;
  }

  return leftDomain !== rightDomain;
};

export const checkVertexCompatibility = (left: GraphVertex, right: GraphVertex): CompatibilityGuardResult => {
  const boundaryFlags: GroupBoundaryFlag[] = [];

  if (hasContractConflict(left, right)) {
    boundaryFlags.push('cross_contract_conflict');
  }
  if (hasInvariantConflict(left, right)) {
    boundaryFlags.push('invariant_conflict');
  }
  if (hasMechanismConflict(left, right)) {
    boundaryFlags.push('mechanism_conflict');
  }
  if (hasSubjectDomainConflict(left, right)) {
    boundaryFlags.push('subject_domain_conflict');
  }

  return {
    compatible: boundaryFlags.length === 0,
    boundaryFlags
  };
};
