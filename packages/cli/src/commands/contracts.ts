import fs from 'node:fs';
import path from 'node:path';
import { buildContractRegistry } from '@zachariahredfield/playbook-engine';
import { ExitCode } from '../lib/cliContract.js';

type ContractsOptions = {
  format: 'text' | 'json';
  quiet: boolean;
  out?: string;
};

const DEFAULT_OUTPUT_PATH = '.playbook/contracts-registry.json';

const printText = (outPath: string): void => {
  console.log('Playbook Contracts Registry');
  console.log('');
  console.log(`Wrote contract registry: ${outPath}`);
  console.log('Use --json for machine-readable output.');
};

export const runContracts = async (cwd: string, options: ContractsOptions): Promise<number> => {
  const payload = buildContractRegistry(cwd);
  const outputPath = options.out ?? DEFAULT_OUTPUT_PATH;
  const absoluteOutputPath = path.resolve(cwd, outputPath);
  const outputJson = `${JSON.stringify(payload, null, 2)}\n`;
  const shouldWriteArtifact = options.out !== undefined || options.format !== 'json';

  if (shouldWriteArtifact) {
    fs.mkdirSync(path.dirname(absoluteOutputPath), { recursive: true });
    fs.writeFileSync(absoluteOutputPath, outputJson, 'utf8');
  }

  if (options.format === 'json') {
    console.log(outputJson.trimEnd());
    return ExitCode.Success;
  }

  if (!options.quiet) {
    if (shouldWriteArtifact) {
      printText(outputPath);
    } else {
      console.log('Playbook Contracts Registry');
      console.log('');
      console.log('Use --json --out <path> to write the contract registry artifact.');
    }
  }

  return ExitCode.Success;
};
