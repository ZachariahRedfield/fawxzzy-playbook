export const ZETTEL_KIND = ['observation', 'question', 'decision', 'pattern', 'risk'] as const;

export type ZettelKind = (typeof ZETTEL_KIND)[number];

export const ZETTEL_LINK_RELATION = ['supports', 'contradicts', 'refines', 'depends_on', 'derived_from'] as const;

export type ZettelLinkRelation = (typeof ZETTEL_LINK_RELATION)[number];


export type ZettelGroupCompatibilityStatus = 'compatible' | 'rejected';

export type ZettelBoundaryFlag =
  | 'cross_contract_conflict'
  | 'invariant_conflict'
  | 'mechanism_conflict'
  | 'subject_domain_conflict';

export type ZettelEvidenceRef = {
  path: string;
  pointer?: string;
  digest?: string;
};

export type Zettel = {
  id: string;
  createdAt: string;
  title: string;
  kind: ZettelKind;
  body: string;
  tags?: string[];
  evidence?: ZettelEvidenceRef[];
  canonicalKey?: string;
  subject?: string;
  summary?: string;
  mechanism?: string;
  invariant?: string;
  subjectDomain?: string;
  allowCrossDomainMerge?: boolean;
  contractRefs?: string[];
  artifactRefs?: string[];
};

export type ZettelLink = {
  id: string;
  createdAt: string;
  sourceZettelId: string;
  targetZettelId: string;
  relation: ZettelLinkRelation;
  rationale?: string;
};
