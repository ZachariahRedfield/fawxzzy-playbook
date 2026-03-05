import fs from 'node:fs';
import path from 'node:path';
import { loadConfig } from '../config/load.js';
import { getChangedFiles } from '../git/diff.js';
import { resolveDiffBase } from '../git/base.js';
import type { ReportFailure, VerifyReport } from '../report/types.js';
import { loadPlugins } from '../plugins/loadPlugins.js';
import {
  getRegisteredRules,
  registerRule,
  resetPluginRegistry
} from '../plugins/pluginRegistry.js';
import type { PlaybookRule } from '../plugins/pluginTypes.js';
import { requireNotesOnChanges } from './rules/requireNotesOnChanges.js';

const coreRules = (config: ReturnType<typeof loadConfig>['config']): PlaybookRule[] => [
  {
    id: 'requireNotesOnChanges',
    run: ({ changedFiles }) => requireNotesOnChanges(changedFiles, config.verify.rules.requireNotesOnChanges)
  }
];

const verifyNotesWhenGovernancePresent = (repoRoot: string): ReportFailure[] => {
  const governancePath = path.join(repoRoot, 'docs/PROJECT_GOVERNANCE.md');
  if (!fs.existsSync(governancePath)) return [];

  const notesPath = path.join(repoRoot, 'docs/PLAYBOOK_NOTES.md');
  if (!fs.existsSync(notesPath)) {
    return [
      {
        id: 'notes.missing',
        message:
          'docs/PLAYBOOK_NOTES.md is required when PROJECT_GOVERNANCE is present. Add an entry describing your change.',
        path: 'docs/PLAYBOOK_NOTES.md',
        hint: 'Create the file and add at least one entry.'
      }
    ];
  }

  const notes = fs.readFileSync(notesPath, 'utf8');
  if (notes.trim().length === 0) {
    return [
      {
        id: 'notes.missing',
        message:
          'docs/PLAYBOOK_NOTES.md is required when PROJECT_GOVERNANCE is present. Add an entry describing your change.',
        path: 'docs/PLAYBOOK_NOTES.md',
        hint: 'Create the file and add at least one entry.'
      }
    ];
  }

  return [];
};

export const verifyRepo = (repoRoot: string): VerifyReport => {
  const warnings: VerifyReport['warnings'] = [];
  const { config, warning: cfgWarning } = loadConfig(repoRoot);
  if (cfgWarning) warnings.push({ id: 'config-missing', message: cfgWarning });

  const base = resolveDiffBase(repoRoot);
  if (base.warning) warnings.push({ id: 'base-selection', message: base.warning });

  const changedFiles = base.baseSha ? getChangedFiles(repoRoot, base.baseSha) : [];

  resetPluginRegistry();
  coreRules(config).forEach(registerRule);
  loadPlugins(repoRoot);

  const failures = [
    ...verifyNotesWhenGovernancePresent(repoRoot),
    ...getRegisteredRules().flatMap((rule) => rule.run({ repoRoot, changedFiles, config }))
  ];

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
