import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import http from 'node:http';
import { emitJsonOutput, writeJsonArtifactAbsolute } from '../../lib/jsonArtifact.js';
import { ExitCode } from '../../lib/cliContract.js';

type ObserverOptions = {
  format: 'text' | 'json';
  quiet: boolean;
};

type ObserverRepoEntry = {
  id: string;
  name: string;
  root: string;
  status: 'connected';
  artifactsRoot: string;
  tags: string[];
};

type ObserverRepoRegistry = {
  schemaVersion: '1.0';
  kind: 'repo-registry';
  repos: ObserverRepoEntry[];
};

const OBSERVER_REPO_REGISTRY_RELATIVE_PATH = '.playbook/observer/repos.json' as const;
const OBSERVER_SNAPSHOT_RELATIVE_PATH = '.playbook/observer/snapshot.json' as const;

const OBSERVER_ARTIFACTS = [
  { kind: 'cycle-state', relativePath: '.playbook/cycle-state.json' },
  { kind: 'cycle-history', relativePath: '.playbook/cycle-history.json' },
  { kind: 'policy-evaluation', relativePath: '.playbook/policy-evaluation.json' },
  { kind: 'policy-apply-result', relativePath: '.playbook/policy-apply-result.json' },
  { kind: 'pr-review', relativePath: '.playbook/pr-review.json' },
  { kind: 'session', relativePath: '.playbook/session.json' }
] as const;

type ObserverArtifactKind = (typeof OBSERVER_ARTIFACTS)[number]['kind'];

const printObserverHelp = (): void => {
  console.log(`Usage: playbook observer <repo|serve> [options]

Manage a deterministic local observer repo registry and read-only local API.

Subcommands:
  repo add <path> [--id <id>] [--tag <tag>]
  repo list
  repo remove <id>
  serve [--host <host>] [--port <port>]

Options:
  --json                       Print machine-readable JSON output
  --help                       Show help`);
};

const readOptionValue = (args: string[], optionName: string): string | null => {
  const exactIndex = args.findIndex((arg) => arg === optionName);
  if (exactIndex >= 0) {
    return args[exactIndex + 1] ?? null;
  }

  const prefixed = args.find((arg) => arg.startsWith(`${optionName}=`));
  if (!prefixed) {
    return null;
  }

  return prefixed.slice(optionName.length + 1) || null;
};

const readOptionValues = (args: string[], optionName: string): string[] => {
  const values: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    if (args[index] !== optionName) {
      continue;
    }

    const value = args[index + 1];
    if (value && !value.startsWith('-')) {
      values.push(value);
    }
  }

  return values;
};

const stableRepoId = (repoRoot: string, repoName: string): string => {
  const digest = crypto.createHash('sha256').update(repoRoot, 'utf8').digest('hex').slice(0, 12);
  return `${repoName}-${digest}`;
};

const normalizeRegistry = (registry: ObserverRepoRegistry): ObserverRepoRegistry => ({
  schemaVersion: '1.0',
  kind: 'repo-registry',
  repos: [...registry.repos].sort((left, right) => left.id.localeCompare(right.id))
});

const defaultRegistry = (): ObserverRepoRegistry => ({
  schemaVersion: '1.0',
  kind: 'repo-registry',
  repos: []
});

const registryPath = (cwd: string): string => path.join(cwd, OBSERVER_REPO_REGISTRY_RELATIVE_PATH);

const readRegistry = (cwd: string): ObserverRepoRegistry => {
  const artifactPath = registryPath(cwd);
  if (!fs.existsSync(artifactPath)) {
    return defaultRegistry();
  }

  const parsed = JSON.parse(fs.readFileSync(artifactPath, 'utf8')) as Partial<ObserverRepoRegistry>;
  if (parsed.schemaVersion !== '1.0' || parsed.kind !== 'repo-registry' || !Array.isArray(parsed.repos)) {
    throw new Error(`playbook observer: invalid registry artifact at ${OBSERVER_REPO_REGISTRY_RELATIVE_PATH}`);
  }

  return normalizeRegistry({
    schemaVersion: '1.0',
    kind: 'repo-registry',
    repos: parsed.repos
      .map((entry) => ({
        id: String(entry.id ?? ''),
        name: String(entry.name ?? ''),
        root: String(entry.root ?? ''),
        status: 'connected' as const,
        artifactsRoot: String(entry.artifactsRoot ?? ''),
        tags: Array.isArray(entry.tags) ? entry.tags.map((tag) => String(tag)).sort((left, right) => left.localeCompare(right)) : []
      }))
      .filter((entry) => entry.id.length > 0)
  });
};

const writeRegistry = (cwd: string, registry: ObserverRepoRegistry): void => {
  writeJsonArtifactAbsolute(registryPath(cwd), normalizeRegistry(registry) as unknown as Record<string, unknown>, 'observer', { envelope: false });
};

const emitObserverPayload = (cwd: string, options: ObserverOptions, payload: Record<string, unknown>, textMessage: string): void => {
  if (options.format === 'json') {
    emitJsonOutput({ cwd, command: 'observer', payload });
    return;
  }

  if (!options.quiet) {
    console.log(textMessage);
  }
};

const nonFlagPositionals = (args: string[]): string[] => {
  const values: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (value.startsWith('-')) {
      if (value === '--id' || value === '--tag') {
        index += 1;
      }
      continue;
    }

    values.push(value);
  }

  return values;
};

const readJsonFile = (targetPath: string): unknown => JSON.parse(fs.readFileSync(targetPath, 'utf8')) as unknown;

const loadSnapshotArtifact = (cwd: string): Record<string, unknown> | null => {
  const snapshotPath = path.join(cwd, OBSERVER_SNAPSHOT_RELATIVE_PATH);
  if (!fs.existsSync(snapshotPath)) {
    return null;
  }

  const value = readJsonFile(snapshotPath);
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  if (candidate.schemaVersion !== '1.0' || candidate.kind !== 'observer-snapshot') {
    return null;
  }

  return candidate;
};

const findArtifactSpec = (kind: string): (typeof OBSERVER_ARTIFACTS)[number] | null =>
  OBSERVER_ARTIFACTS.find((artifact) => artifact.kind === kind) ?? null;

const readRepoArtifact = (repo: ObserverRepoEntry, kind: ObserverArtifactKind): { kind: ObserverArtifactKind; value: unknown | null } => {
  const spec = findArtifactSpec(kind);
  if (!spec) {
    return { kind, value: null };
  }

  const artifactPath = path.join(repo.root, spec.relativePath);
  if (!fs.existsSync(artifactPath)) {
    return { kind, value: null };
  }

  try {
    return { kind, value: readJsonFile(artifactPath) };
  } catch {
    return { kind, value: null };
  }
};

const buildSnapshotFromRegistry = (registry: ObserverRepoRegistry): Record<string, unknown> => ({
  schemaVersion: '1.0',
  kind: 'observer-snapshot',
  repos: registry.repos.map((repo) => ({
    id: repo.id,
    name: repo.name,
    status: repo.status,
    artifacts: OBSERVER_ARTIFACTS.map((artifact) => readRepoArtifact(repo, artifact.kind))
  }))
});

const writeJsonResponse = (response: http.ServerResponse, statusCode: number, payload: Record<string, unknown>): void => {
  response.statusCode = statusCode;
  response.setHeader('content-type', 'application/json; charset=utf-8');
  response.end(`${JSON.stringify(payload, null, 2)}\n`);
};

const observerServerResponse = (cwd: string, pathname: string): { statusCode: number; payload: Record<string, unknown> } => {
  const registry = readRegistry(cwd);
  const base = { schemaVersion: '1.0', readOnly: true, localOnly: true };

  if (pathname === '/health') {
    return {
      statusCode: 200,
      payload: { ...base, kind: 'observer-server-health', status: 'ok' }
    };
  }

  if (pathname === '/repos') {
    return {
      statusCode: 200,
      payload: { ...base, kind: 'observer-server-repos', repos: registry.repos }
    };
  }

  if (pathname === '/snapshot') {
    return {
      statusCode: 200,
      payload: { ...base, snapshot: loadSnapshotArtifact(cwd) ?? buildSnapshotFromRegistry(registry) }
    };
  }

  const repoMatch = /^\/repos\/([^/]+)$/.exec(pathname);
  if (repoMatch) {
    const repo = registry.repos.find((entry) => entry.id === decodeURIComponent(repoMatch[1] ?? ''));
    if (!repo) {
      return { statusCode: 404, payload: { ...base, kind: 'observer-server-error', error: 'repo-not-found' } };
    }
    return { statusCode: 200, payload: { ...base, kind: 'observer-server-repo', repo } };
  }

  const artifactMatch = /^\/repos\/([^/]+)\/artifacts\/([^/]+)$/.exec(pathname);
  if (artifactMatch) {
    const repo = registry.repos.find((entry) => entry.id === decodeURIComponent(artifactMatch[1] ?? ''));
    if (!repo) {
      return { statusCode: 404, payload: { ...base, kind: 'observer-server-error', error: 'repo-not-found' } };
    }

    const artifactKind = decodeURIComponent(artifactMatch[2] ?? '');
    const spec = findArtifactSpec(artifactKind);
    if (!spec) {
      return { statusCode: 404, payload: { ...base, kind: 'observer-server-error', error: 'artifact-kind-not-found' } };
    }

    return {
      statusCode: 200,
      payload: {
        ...base,
        kind: 'observer-server-artifact',
        repoId: repo.id,
        artifact: readRepoArtifact(repo, spec.kind)
      }
    };
  }

  return { statusCode: 404, payload: { ...base, kind: 'observer-server-error', error: 'not-found' } };
};

export const createObserverServer = (cwd: string): http.Server =>
  http.createServer((request, response) => {
    if (request.method !== 'GET') {
      writeJsonResponse(response, 405, { schemaVersion: '1.0', kind: 'observer-server-error', error: 'method-not-allowed', readOnly: true, localOnly: true });
      return;
    }

    const parsedUrl = new URL(request.url ?? '/', 'http://localhost');
    const result = observerServerResponse(cwd, parsedUrl.pathname);
    writeJsonResponse(response, result.statusCode, result.payload);
  });

export const runObserver = async (cwd: string, args: string[], options: ObserverOptions): Promise<number> => {
  if (args.includes('--help') || args.includes('-h') || args.length === 0) {
    printObserverHelp();
    return args.length === 0 ? ExitCode.Failure : ExitCode.Success;
  }

  const [scope, action] = args;

  if (scope === 'serve') {
    const requestedHost = readOptionValue(args, '--host')?.trim();
    const host = requestedHost && requestedHost.length > 0 ? requestedHost : '127.0.0.1';
    const requestedPort = readOptionValue(args, '--port');
    const parsedPort = requestedPort ? Number.parseInt(requestedPort, 10) : 4300;
    const port = Number.isInteger(parsedPort) && parsedPort >= 0 && parsedPort <= 65535 ? parsedPort : Number.NaN;
    if (Number.isNaN(port)) {
      const message = 'playbook observer serve: --port must be an integer between 0 and 65535';
      if (options.format === 'json') {
        emitJsonOutput({ cwd, command: 'observer', payload: { schemaVersion: '1.0', command: 'observer', error: message } });
      } else {
        console.error(message);
      }
      return ExitCode.Failure;
    }

    if (host !== '127.0.0.1' && host !== 'localhost') {
      const message = 'playbook observer serve: only local hosts are supported in v1 (127.0.0.1 or localhost).';
      if (options.format === 'json') {
        emitJsonOutput({ cwd, command: 'observer', payload: { schemaVersion: '1.0', command: 'observer', error: message } });
      } else {
        console.error(message);
      }
      return ExitCode.Failure;
    }

    const server = createObserverServer(cwd);

    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, host, () => {
        server.off('error', reject);
        resolve();
      });
    });

    const address = server.address();
    const boundPort = typeof address === 'object' && address ? address.port : port;
    const message = `Observer server listening at http://${host}:${boundPort}`;
    if (options.format === 'json') {
      emitJsonOutput({ cwd, command: 'observer', payload: { schemaVersion: '1.0', command: 'observer-serve', host, port: boundPort, readOnly: true, localOnly: true } });
    } else if (!options.quiet) {
      console.log(message);
    }

    await new Promise<void>((resolve) => {
      const closeServer = (): void => {
        server.close(() => resolve());
      };

      process.once('SIGINT', closeServer);
      process.once('SIGTERM', closeServer);
    });

    return ExitCode.Success;
  }

  if (scope !== 'repo' || !['add', 'list', 'remove'].includes(action ?? '')) {
    const message = 'playbook observer: use `playbook observer repo <add|list|remove>` or `playbook observer serve`.';
    if (options.format === 'json') {
      emitJsonOutput({ cwd, command: 'observer', payload: { schemaVersion: '1.0', command: 'observer', error: message } });
    } else {
      console.error(message);
    }
    return ExitCode.Failure;
  }

  const registry = readRegistry(cwd);

  try {
    if (action === 'list') {
      emitObserverPayload(
        cwd,
        options,
        { schemaVersion: '1.0', command: 'observer-repo-list', registry },
        registry.repos.length === 0 ? 'No connected observer repositories.' : registry.repos.map((repo) => `${repo.id} ${repo.root}`).join('\n')
      );
      return ExitCode.Success;
    }

    if (action === 'add') {
      const pathArg = nonFlagPositionals(args.slice(2))[0];
      if (!pathArg) {
        throw new Error('playbook observer repo add: missing <path> argument');
      }

      const root = path.resolve(cwd, pathArg);
      const rootStat = fs.existsSync(root) ? fs.statSync(root) : null;
      if (!rootStat || !rootStat.isDirectory()) {
        throw new Error(`playbook observer repo add: repository root does not exist: ${root}`);
      }

      const artifactsRoot = path.join(root, '.playbook');
      if (fs.existsSync(artifactsRoot)) {
        const artifactsStat = fs.statSync(artifactsRoot);
        if (!artifactsStat.isDirectory()) {
          throw new Error(`playbook observer repo add: expected directory at ${artifactsRoot}`);
        }
      }

      const repoName = path.basename(root);
      const requestedId = readOptionValue(args, '--id');
      const repoId = requestedId && requestedId.trim().length > 0 ? requestedId.trim() : stableRepoId(root, repoName);
      const duplicateId = registry.repos.find((repo) => repo.id === repoId);
      if (duplicateId) {
        throw new Error(`playbook observer repo add: duplicate id "${repoId}"`);
      }

      const duplicateRoot = registry.repos.find((repo) => repo.root === root);
      if (duplicateRoot) {
        throw new Error(`playbook observer repo add: duplicate root "${root}" already registered as "${duplicateRoot.id}"`);
      }

      const tags = [...new Set(readOptionValues(args, '--tag').map((tag) => tag.trim()).filter((tag) => tag.length > 0))].sort((left, right) => left.localeCompare(right));
      const entry: ObserverRepoEntry = {
        id: repoId,
        name: repoName,
        root,
        status: 'connected',
        artifactsRoot,
        tags
      };

      const nextRegistry = normalizeRegistry({ ...registry, repos: [...registry.repos, entry] });
      writeRegistry(cwd, nextRegistry);

      emitObserverPayload(cwd, options, { schemaVersion: '1.0', command: 'observer-repo-add', repo: entry, registry: nextRegistry }, `Connected observer repo ${entry.id}`);
      return ExitCode.Success;
    }

    const removeId = nonFlagPositionals(args.slice(2))[0];
    if (!removeId) {
      throw new Error('playbook observer repo remove: missing <id> argument');
    }

    const existing = registry.repos.find((repo) => repo.id === removeId);
    if (!existing) {
      throw new Error(`playbook observer repo remove: unknown id "${removeId}"`);
    }

    const nextRegistry = normalizeRegistry({ ...registry, repos: registry.repos.filter((repo) => repo.id !== removeId) });
    writeRegistry(cwd, nextRegistry);
    emitObserverPayload(cwd, options, { schemaVersion: '1.0', command: 'observer-repo-remove', removedId: removeId, registry: nextRegistry }, `Removed observer repo ${removeId}`);
    return ExitCode.Success;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (options.format === 'json') {
      emitJsonOutput({ cwd, command: 'observer', payload: { schemaVersion: '1.0', command: 'observer', error: message } });
    } else {
      console.error(message);
    }
    return ExitCode.Failure;
  }
};

export { OBSERVER_REPO_REGISTRY_RELATIVE_PATH };
