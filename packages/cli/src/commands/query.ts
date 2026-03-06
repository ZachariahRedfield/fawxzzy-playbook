import { queryRepositoryIndex, SUPPORTED_QUERY_FIELDS, type RepositoryQueryField } from '@zachariahredfield/playbook-engine';
import { ExitCode } from '../lib/cliContract.js';

type QueryOptions = {
  format: 'text' | 'json';
  quiet: boolean;
};

type QueryResult = {
  command: 'query';
  field: RepositoryQueryField;
  result: string | string[];
};

const firstPositionalArg = (args: string[]): string | undefined => args.find((arg) => !arg.startsWith('-'));

const printText = (field: RepositoryQueryField, result: string | string[]): void => {
  const heading = field.charAt(0).toUpperCase() + field.slice(1);
  console.log(heading);
  console.log('───────');

  if (Array.isArray(result)) {
    if (result.length === 0) {
      console.log('none');
      return;
    }

    for (const value of result) {
      console.log(value);
    }
    return;
  }

  console.log(result);
};

export const runQuery = async (cwd: string, commandArgs: string[], options: QueryOptions): Promise<number> => {
  const fieldArg = firstPositionalArg(commandArgs);
  if (!fieldArg) {
    console.error('playbook query: missing required <field> argument');
    return ExitCode.Failure;
  }

  try {
    const query = queryRepositoryIndex(cwd, fieldArg);
    const result: QueryResult = {
      command: 'query',
      field: query.field,
      result: query.result
    };

    if (options.format === 'json') {
      console.log(JSON.stringify(result, null, 2));
      return ExitCode.Success;
    }

    if (!options.quiet) {
      printText(result.field, result.result);
    }

    return ExitCode.Success;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (options.format === 'json') {
      console.log(
        JSON.stringify(
          {
            command: 'query',
            field: fieldArg,
            error: message,
            supportedFields: [...SUPPORTED_QUERY_FIELDS]
          },
          null,
          2
        )
      );
    } else {
      console.error(message);
    }

    return ExitCode.Failure;
  }
};
