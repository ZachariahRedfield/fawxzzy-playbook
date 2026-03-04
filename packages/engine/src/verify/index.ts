import { loadConfig } from '../config/load.js';
import { getChangedFiles } from '../git/diff.js';
import { resolveDiffBase } from '../git/base.js';
import type { VerifyReport } from '../report/types.js';
import { requireNotesOnChanges } from './rules/requireNotesOnChanges.js';

export const verifyRepo = (repoRoot: string): VerifyReport => {
  const warnings: VerifyReport['warnings'] = [];
  const { config, warning: cfgWarning } = loadConfig(repoRoot);
  if (cfgWarning) warnings.push({ id: 'config-missing', message: cfgWarning });

  const base = resolveDiffBase(repoRoot);
  if (base.warning) warnings.push({ id: 'base-selection', message: base.warning });

  const changedFiles = base.baseSha ? getChangedFiles(repoRoot, base.baseSha) : [];
  const failures = requireNotesOnChanges(changedFiles, config.verify.rules.requireNotesOnChanges);

  return {
    ok: failures.length === 0,
    summary: {
      failures: failures.length,
      warnings: warnings.length,
      baseRef: base.baseRef,
      baseSha: base.baseSha
    },
    failures,
    warnings
  };
};
