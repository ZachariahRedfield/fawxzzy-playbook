import { generateRepositoryIndex } from '@zachariahredfield/playbook-engine';
import fs from 'node:fs';
import path from 'node:path';
import { ExitCode } from '../lib/cliContract.js';

type IndexOptions = {
  format: 'text' | 'json';
  quiet: boolean;
};

type IndexResult = {
  command: 'index';
  ok: true;
  indexFile: '.playbook/repo-index.json';
  framework: string;
  architecture: string;
  modules: string[];
};

const INDEX_RELATIVE_PATH = '.playbook/repo-index.json' as const;

const writeRepositoryIndex = (cwd: string): { indexPath: string; result: IndexResult } => {
  const index = generateRepositoryIndex(cwd);
  const indexPath = path.join(cwd, INDEX_RELATIVE_PATH);
  fs.mkdirSync(path.dirname(indexPath), { recursive: true });
  fs.writeFileSync(indexPath, `${JSON.stringify(index, null, 2)}\n`, 'utf8');

  return {
    indexPath,
    result: {
      command: 'index',
      ok: true,
      indexFile: INDEX_RELATIVE_PATH,
      framework: index.framework,
      architecture: index.architecture,
      modules: index.modules
    }
  };
};

export const runIndex = async (cwd: string, options: IndexOptions): Promise<number> => {
  const { result } = writeRepositoryIndex(cwd);

  if (options.format === 'json') {
    console.log(JSON.stringify(result, null, 2));
    return ExitCode.Success;
  }

  if (!options.quiet) {
    console.log('Repository Intelligence');
    console.log('───────────────────────');
    console.log(`Index file: ${result.indexFile}`);
    console.log(`Framework: ${result.framework}`);
    console.log(`Architecture: ${result.architecture}`);
    console.log(`Modules: ${result.modules.length > 0 ? result.modules.join(', ') : 'none'}`);
  }

  return ExitCode.Success;
};
