import fs from 'node:fs';
import path from 'node:path';

export const SECURITY_BASELINE_RELATIVE_PATH = '.playbook/security-baseline.json' as const;

export const SECURITY_BASELINE_STATUSES = [
  'direct',
  'transitive',
  'tooling-only',
  'false-positive',
  'untriaged'
] as const;

export type SecurityBaselineStatus = (typeof SECURITY_BASELINE_STATUSES)[number];

export type SecurityBaselineFinding = {
  package_name: string;
  installed_version: string;
  ecosystem: string;
  vulnerability_id: string;
  severity: string;
  dependency_path: string;
  direct_or_transitive: 'direct' | 'transitive' | 'unknown';
  status: SecurityBaselineStatus;
};

export type SecurityBaselineArtifact = {
  schemaVersion: '1.0';
  kind: 'security-baseline';
  generatedAt: string;
  findings: SecurityBaselineFinding[];
};

export type SecurityBaselineSummary = {
  schemaVersion: '1.0';
  command: 'security-baseline-summary';
  generatedAt: string;
  totalFindings: number;
  byStatus: Record<SecurityBaselineStatus, number>;
  bySeverity: Record<string, number>;
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const normalizeString = (value: unknown, fallback: string): string => {
  if (typeof value !== 'string') {
    return fallback;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : fallback;
};

const normalizeStatus = (value: unknown): SecurityBaselineStatus => {
  const normalized = normalizeString(value, 'untriaged');
  return SECURITY_BASELINE_STATUSES.includes(normalized as SecurityBaselineStatus)
    ? (normalized as SecurityBaselineStatus)
    : 'untriaged';
};

const normalizeDirectness = (value: unknown): 'direct' | 'transitive' | 'unknown' => {
  const normalized = normalizeString(value, 'unknown');
  if (normalized === 'direct' || normalized === 'transitive') {
    return normalized;
  }

  return 'unknown';
};

const validateFinding = (value: unknown, index: number): SecurityBaselineFinding => {
  if (!isRecord(value)) {
    throw new Error(`playbook security baseline: finding at index ${index} is invalid.`);
  }

  return {
    package_name: normalizeString(value.package_name, 'unknown-package'),
    installed_version: normalizeString(value.installed_version, 'unknown-version'),
    ecosystem: normalizeString(value.ecosystem, 'unknown-ecosystem'),
    vulnerability_id: normalizeString(value.vulnerability_id, 'unknown-vulnerability'),
    severity: normalizeString(value.severity, 'unknown'),
    dependency_path: normalizeString(value.dependency_path, ''),
    direct_or_transitive: normalizeDirectness(value.direct_or_transitive),
    status: normalizeStatus(value.status)
  };
};

const compareFindings = (left: SecurityBaselineFinding, right: SecurityBaselineFinding): number => {
  const packageCompare = left.package_name.localeCompare(right.package_name);
  if (packageCompare !== 0) {
    return packageCompare;
  }

  const vulnerabilityCompare = left.vulnerability_id.localeCompare(right.vulnerability_id);
  if (vulnerabilityCompare !== 0) {
    return vulnerabilityCompare;
  }

  const versionCompare = left.installed_version.localeCompare(right.installed_version);
  if (versionCompare !== 0) {
    return versionCompare;
  }

  return left.dependency_path.localeCompare(right.dependency_path);
};

export const sortSecurityBaselineFindings = (findings: SecurityBaselineFinding[]): SecurityBaselineFinding[] =>
  [...findings].sort(compareFindings);

export const normalizeSecurityBaselineArtifact = (value: unknown): SecurityBaselineArtifact => {
  if (!isRecord(value)) {
    throw new Error('playbook security baseline: artifact must be a JSON object.');
  }

  if (value.schemaVersion !== '1.0') {
    throw new Error(
      `playbook security baseline: unsupported schemaVersion "${String(value.schemaVersion)}". Expected "1.0".`
    );
  }

  if (value.kind !== 'security-baseline') {
    throw new Error(`playbook security baseline: unsupported kind "${String(value.kind)}". Expected "security-baseline".`);
  }

  const findingsRaw = Array.isArray(value.findings) ? value.findings : [];
  const findings = sortSecurityBaselineFindings(findingsRaw.map((entry, index) => validateFinding(entry, index)));

  return {
    schemaVersion: '1.0',
    kind: 'security-baseline',
    generatedAt: normalizeString(value.generatedAt, new Date(0).toISOString()),
    findings
  };
};

export const readSecurityBaselineArtifact = (projectRoot: string): SecurityBaselineArtifact => {
  const artifactPath = path.join(projectRoot, SECURITY_BASELINE_RELATIVE_PATH);
  if (!fs.existsSync(artifactPath)) {
    throw new Error(
      'playbook security baseline: missing .playbook/security-baseline.json. Capture baseline findings in CI first.'
    );
  }

  const raw = fs.readFileSync(artifactPath, 'utf8');
  return normalizeSecurityBaselineArtifact(JSON.parse(raw));
};

export const summarizeSecurityBaseline = (projectRoot: string): SecurityBaselineSummary => {
  const baseline = readSecurityBaselineArtifact(projectRoot);
  const byStatus = SECURITY_BASELINE_STATUSES.reduce<Record<SecurityBaselineStatus, number>>(
    (accumulator, status) => {
      accumulator[status] = 0;
      return accumulator;
    },
    {
      direct: 0,
      transitive: 0,
      'tooling-only': 0,
      'false-positive': 0,
      untriaged: 0
    }
  );

  const bySeverity: Record<string, number> = {};

  for (const finding of baseline.findings) {
    byStatus[finding.status] += 1;
    bySeverity[finding.severity] = (bySeverity[finding.severity] ?? 0) + 1;
  }

  const orderedBySeverity = Object.fromEntries(
    Object.entries(bySeverity).sort(([left], [right]) => left.localeCompare(right))
  );

  return {
    schemaVersion: '1.0',
    command: 'security-baseline-summary',
    generatedAt: baseline.generatedAt,
    totalFindings: baseline.findings.length,
    byStatus,
    bySeverity: orderedBySeverity
  };
};

export const showSecurityBaselineForPackage = (projectRoot: string, packageName: string): SecurityBaselineArtifact => {
  const baseline = readSecurityBaselineArtifact(projectRoot);
  const findings = baseline.findings.filter((finding) => finding.package_name === packageName);

  return {
    ...baseline,
    findings
  };
};
