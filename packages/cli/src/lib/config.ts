import { loadConfig } from '@playbook/engine';

export const readConfig = (repoRoot: string) => loadConfig(repoRoot);
