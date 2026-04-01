import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

export const RUNTIME_MANIFESTS_RELATIVE_PATH = '.playbook/runtime-manifests.json' as const;
const RUNTIME_MANIFEST_FILE = 'playbook/runtime-manifest.json' as const;
const RUNTIME_MANIFEST_SEARCH_ROOTS = ['subapps', 'examples/subapps'] as const;

type RuntimeManifestRecord = Record<string, unknown>;

export type AggregatedRuntimeManifestEntry = {
  subappPath: string;
  subappId: string;
  app_identity?: unknown;
  runtime_role?: unknown;
  runtime_status?: unknown;
  signal_groups?: unknown;
  state_snapshot_types?: unknown;
  bounded_action_families?: unknown;
  receipt_families?: unknown;
  integration_seams?: unknown;
  external_truth_contract_ref?: unknown;
  provenance: {
    sourcePath: string;
    sourceHash: string;
  };
};

export type AggregatedRuntimeManifestsArtifact = {
  schemaVersion: '1.0';
  kind: 'playbook-runtime-manifests';
  manifests: AggregatedRuntimeManifestEntry[];
};

const isRecord = (value: unknown): value is RuntimeManifestRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const toPosixPath = (value: string): string => value.split(path.sep).join('/');

const sha256 = (value: string): string => createHash('sha256').update(value, 'utf8').digest('hex');

const discoverManifestPaths = (projectRoot: string): string[] => {
  const discovered: string[] = [];
  for (const root of RUNTIME_MANIFEST_SEARCH_ROOTS) {
    const rootAbsolute = path.join(projectRoot, root);
    if (!fs.existsSync(rootAbsolute) || !fs.statSync(rootAbsolute).isDirectory()) {
      continue;
    }
    const entries = fs.readdirSync(rootAbsolute, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(root, entry.name, RUNTIME_MANIFEST_FILE))
      .filter((relativePath) => fs.existsSync(path.join(projectRoot, relativePath)));
    discovered.push(...entries);
  }
  return discovered.sort((a, b) => a.localeCompare(b));
};

const toManifestEntry = (projectRoot: string, relativePath: string): AggregatedRuntimeManifestEntry | null => {
  const absolutePath = path.join(projectRoot, relativePath);
  const raw = fs.readFileSync(absolutePath, 'utf8');
  const parsed = JSON.parse(raw) as unknown;
  if (!isRecord(parsed)) {
    return null;
  }
  const subappPath = toPosixPath(path.dirname(path.dirname(relativePath)));
  const maybeExternalRef = Object.prototype.hasOwnProperty.call(parsed, 'external_truth_contract_ref')
    ? { external_truth_contract_ref: parsed.external_truth_contract_ref }
    : {};
  return {
    subappPath,
    subappId: path.basename(subappPath),
    app_identity: parsed.app_identity,
    runtime_role: parsed.runtime_role,
    runtime_status: parsed.runtime_status,
    signal_groups: parsed.signal_groups,
    state_snapshot_types: parsed.state_snapshot_types,
    bounded_action_families: parsed.bounded_action_families,
    receipt_families: parsed.receipt_families,
    integration_seams: parsed.integration_seams,
    ...maybeExternalRef,
    provenance: {
      sourcePath: toPosixPath(relativePath),
      sourceHash: sha256(raw)
    }
  };
};

export const aggregateRuntimeManifests = (projectRoot: string): AggregatedRuntimeManifestsArtifact => {
  const manifests = discoverManifestPaths(projectRoot)
    .map((relativePath) => toManifestEntry(projectRoot, relativePath))
    .filter((entry): entry is AggregatedRuntimeManifestEntry => entry !== null);

  return {
    schemaVersion: '1.0',
    kind: 'playbook-runtime-manifests',
    manifests
  };
};

export const writeRuntimeManifestsArtifact = (projectRoot: string, artifact: AggregatedRuntimeManifestsArtifact): string => {
  const artifactPath = path.join(projectRoot, RUNTIME_MANIFESTS_RELATIVE_PATH);
  fs.mkdirSync(path.dirname(artifactPath), { recursive: true });
  fs.writeFileSync(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
  return artifactPath;
};

export const materializeRuntimeManifestsArtifact = (projectRoot: string): AggregatedRuntimeManifestsArtifact => {
  const artifact = aggregateRuntimeManifests(projectRoot);
  writeRuntimeManifestsArtifact(projectRoot, artifact);
  return artifact;
};
