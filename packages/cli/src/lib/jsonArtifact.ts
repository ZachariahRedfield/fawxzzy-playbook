import fs from 'node:fs';
import path from 'node:path';

const toAbsoluteOutputPath = (cwd: string, outFile: string): string => (path.isAbsolute(outFile) ? outFile : path.join(cwd, outFile));

export const writeJsonArtifact = (cwd: string, outFile: string, payload: unknown, command: string): string => {
  const targetPath = toAbsoluteOutputPath(cwd, outFile);

  try {
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
    return targetPath;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`playbook ${command}: failed to write JSON artifact to ${targetPath}: ${message}`);
  }
};

export const emitJsonOutput = (options: {
  cwd: string;
  command: string;
  payload: unknown;
  outFile?: string;
}): void => {
  if (options.outFile) {
    writeJsonArtifact(options.cwd, options.outFile, options.payload, options.command);
  }

  console.log(JSON.stringify(options.payload, null, 2));
};
