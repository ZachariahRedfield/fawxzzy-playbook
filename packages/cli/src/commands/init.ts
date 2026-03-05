import fs from "node:fs";
import path from "node:path";
import { ensureDir, listFilesRecursive } from "../lib/fs.js";
import { info } from "../lib/output.js";

const templateRoot =
  process.env.PLAYBOOK_TEMPLATES_DIR ??
  // dist/commands/init.js -> ../templates/repo
  path.resolve(import.meta.dirname, "../templates/repo");

export const runInit = (cwd: string): void => {
  if (!fs.existsSync(templateRoot)) {
    throw new Error(
      `Templates directory not found: ${templateRoot}\n` +
        `If running from source, run "pnpm run sync:templates" or set PLAYBOOK_TEMPLATES_DIR.`
    );
  }

  const files = listFilesRecursive(templateRoot);
  for (const srcFile of files) {
    const rel = path.relative(templateRoot, srcFile);
    const dest = path.join(cwd, rel);
    ensureDir(path.dirname(dest));

    if (fs.existsSync(dest)) {
      info(`skipped ${rel}`);
      continue;
    }

    fs.copyFileSync(srcFile, dest);
    info(`created ${rel}`);
  }
};
