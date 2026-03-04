import { matchesAny } from '../../util/globs.js';
import type { ReportFailure } from '../../report/types.js';

export type NotesRule = {
  whenChanged: string[];
  mustTouch: string[];
};

export const requireNotesOnChanges = (
  changedFiles: string[],
  rules: NotesRule[]
): ReportFailure[] => {
  const failures: ReportFailure[] = [];

  for (const rule of rules) {
    const triggers = changedFiles.filter((f) => matchesAny(f, rule.whenChanged));
    if (!triggers.length) continue;

    const touchedRequired = changedFiles.some((f) => matchesAny(f, rule.mustTouch));
    if (touchedRequired) continue;

    failures.push({
      id: 'requireNotesOnChanges',
      message: 'Code changes require a notes update.',
      evidence: `triggered files (${triggers.length}): ${triggers.slice(0, 10).join(', ')}`,
      fix: 'Update docs/PLAYBOOK_NOTES.md with a note describing WHAT changed and WHY.'
    });
  }

  return failures;
};
