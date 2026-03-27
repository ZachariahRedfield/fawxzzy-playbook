import * as engineRuntime from '@zachariahredfield/playbook-engine';
import path from 'node:path';
import { ExitCode } from '../lib/cliContract.js';
import { emitJsonOutput } from '../lib/jsonArtifact.js';
import { printCommandHelp } from '../lib/commandSurface.js';

type InteropOptions = {
  format: 'text' | 'json';
  quiet: boolean;
  help?: boolean;
};

const engine = engineRuntime as unknown as {
  readArtifactJson: <T>(targetPath: string) => T;
  registerRemediationInteropCapability: (
    repoRoot: string,
    input: {
      capabilityId: string;
      workerId: string;
      actions: Array<'test-triage' | 'test-fix-plan' | 'apply-result' | 'test-autofix' | 'remediation-status'>;
      registeredAt: string;
      idempotencyKey: string;
    }
  ) => unknown;
  emitBoundedInteropActionRequest: (
    repoRoot: string,
    input: {
      requestId: string;
      action: 'test-triage' | 'test-fix-plan' | 'apply-result' | 'test-autofix' | 'remediation-status';
      manifest: Record<string, unknown>;
      evaluation: { releaseReady: boolean; state: string; blockers: string[] };
      payload?: Record<string, unknown>;
      requestedAt: string;
      idempotencyKey: string;
    }
  ) => unknown;
  evaluateRendezvousManifest: (
    manifest: Record<string, unknown>,
    options: { currentSha: string; observedArtifacts?: Record<string, unknown> }
  ) => { releaseReady: boolean; state: string; blockers: string[] };
  runMockLifelineAdapterCycle: (
    repoRoot: string,
    input: {
      workerId: string;
      now: string;
      failRequestIds?: string[];
      rejectRequestIds?: string[];
    }
  ) => unknown;
  readRemediationInteropStore: (repoRoot: string) => unknown;
  reconcileRemediationInteropState: (store: Record<string, unknown>, generatedAt: string) => unknown;
  writeRemediationInteropStore: (repoRoot: string, store: unknown) => void;
  inspectRemediationInterop: (repoRoot: string) => unknown;
};

const asJson = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;

const parseArg = (args: string[], name: string): string | undefined => {
  const index = args.indexOf(name);
  if (index < 0 || !args[index + 1]) {
    return undefined;
  }
  return String(args[index + 1]);
};

const parseArgList = (args: string[], name: string): string[] => {
  const value = parseArg(args, name);
  if (!value) return [];
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
};

const parseNow = (args: string[]): string => parseArg(args, '--now') ?? new Date().toISOString();

export const runInterop = async (cwd: string, commandArgs: string[], options: InteropOptions): Promise<number> => {
  const subcommand = commandArgs.find((entry) => !entry.startsWith('-'));
  if (options.help || !subcommand || subcommand === 'help') {
    printCommandHelp({
      usage: 'playbook interop <register|emit|mock-run|reconcile|inspect> [options] [--json]',
      description: 'Remediation-first Playbook↔Lifeline interop surfaces for deterministic request/receipt execution.',
      options: [
        'register --capability <id> --worker <id> --actions test-autofix,remediation-status',
        'emit --action <action> --request-id <id> --idempotency-key <key>  (requires release-ready rendezvous manifest)',
        'mock-run --worker <id> [--fail-requests id1,id2] [--reject-requests id3]',
        'reconcile            rebuild pending/running/failed/completed/blocked/rejected buckets',
        'inspect [surface]    surfaces: capabilities | requests | receipts | heartbeat | health | reconcile | all',
        '--json               print full payload'
      ],
      artifacts: ['.playbook/rendezvous-manifest.json', '.playbook/remediation-interop-store.json']
    });
    return subcommand || options.help ? ExitCode.Success : ExitCode.Failure;
  }

  try {
    if (subcommand === 'register') {
      const capabilityId = parseArg(commandArgs, '--capability') ?? 'mock-lifeline';
      const workerId = parseArg(commandArgs, '--worker') ?? 'lifeline-worker-001';
      const actions = parseArgList(commandArgs, '--actions') as Array<'test-triage' | 'test-fix-plan' | 'apply-result' | 'test-autofix' | 'remediation-status'>;
      const payload = engine.registerRemediationInteropCapability(cwd, {
        capabilityId,
        workerId,
        actions,
        registeredAt: parseNow(commandArgs),
        idempotencyKey: parseArg(commandArgs, '--idempotency-key') ?? `${capabilityId}:${workerId}`
      });

      if (options.format === 'json') {
        emitJsonOutput({ cwd, command: 'interop', payload });
      } else if (!options.quiet) {
        console.log(asJson(payload));
      }
      return ExitCode.Success;
    }

    if (subcommand === 'emit') {
      const manifest = engine.readArtifactJson<Record<string, unknown>>(path.join(cwd, '.playbook/rendezvous-manifest.json'));
      const manifestArtifacts = (manifest.artifacts ?? {}) as Record<string, unknown>;
      const evaluation = engine.evaluateRendezvousManifest(manifest, {
        currentSha: String(manifest.baseSha ?? 'unknown'),
        observedArtifacts: manifestArtifacts
      });
      const action = (parseArg(commandArgs, '--action') ?? 'test-autofix') as 'test-triage' | 'test-fix-plan' | 'apply-result' | 'test-autofix' | 'remediation-status';

      const payload = engine.emitBoundedInteropActionRequest(cwd, {
        requestId: parseArg(commandArgs, '--request-id') ?? `req:${action}`,
        action,
        manifest,
        evaluation,
        requestedAt: parseNow(commandArgs),
        idempotencyKey: parseArg(commandArgs, '--idempotency-key') ?? `idempotency:${action}`,
        payload: {}
      });

      if (options.format === 'json') {
        emitJsonOutput({ cwd, command: 'interop', payload });
      } else if (!options.quiet) {
        console.log(asJson(payload));
      }
      return ExitCode.Success;
    }

    if (subcommand === 'mock-run') {
      const payload = engine.runMockLifelineAdapterCycle(cwd, {
        workerId: parseArg(commandArgs, '--worker') ?? 'lifeline-worker-001',
        now: parseNow(commandArgs),
        failRequestIds: parseArgList(commandArgs, '--fail-requests'),
        rejectRequestIds: parseArgList(commandArgs, '--reject-requests')
      });

      if (options.format === 'json') {
        emitJsonOutput({ cwd, command: 'interop', payload });
      } else if (!options.quiet) {
        console.log(asJson(payload));
      }
      return ExitCode.Success;
    }

    if (subcommand === 'reconcile') {
      const store = engine.readRemediationInteropStore(cwd) as Record<string, unknown>;
      const payload = engine.reconcileRemediationInteropState(store, parseNow(commandArgs));
      engine.writeRemediationInteropStore(cwd, payload);

      if (options.format === 'json') {
        emitJsonOutput({ cwd, command: 'interop', payload });
      } else if (!options.quiet) {
        console.log(asJson(payload));
      }
      return ExitCode.Success;
    }

    if (subcommand === 'inspect') {
      const payload = engine.inspectRemediationInterop(cwd) as Record<string, unknown>;
      const surface = parseArg(commandArgs, '--surface') ?? commandArgs[1] ?? 'all';
      const inspected =
        surface === 'all'
          ? payload
          : surface === 'capabilities'
            ? { capabilities: payload.capabilities }
            : surface === 'requests'
              ? { requests: payload.requests }
              : surface === 'receipts'
                ? { latestReceipts: payload.latestReceipts }
                : surface === 'heartbeat' || surface === 'health'
                  ? { heartbeat: payload.heartbeat }
                  : surface === 'reconcile'
                    ? { reconcile: payload.reconcile }
                    : payload;

      if (options.format === 'json') {
        emitJsonOutput({ cwd, command: 'interop', payload: inspected });
      } else if (!options.quiet) {
        console.log(asJson(inspected));
      }
      return ExitCode.Success;
    }

    throw new Error(`playbook interop: unknown subcommand "${subcommand}"`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (options.format === 'json') {
      console.log(JSON.stringify({ schemaVersion: '1.0', command: 'interop', error: message }, null, 2));
    } else {
      console.error(message);
    }
    return ExitCode.Failure;
  }
};
