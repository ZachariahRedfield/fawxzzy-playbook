import fs from 'node:fs';
import path from 'node:path';
import { defaultConfig, type PlaybookConfig } from './schema.js';

export const loadConfig = (repoRoot: string): { config: PlaybookConfig; warning?: string } => {
  const filePath = path.join(repoRoot, 'playbook.config.json');
  if (!fs.existsSync(filePath)) {
    return { config: defaultConfig, warning: 'playbook.config.json not found; using defaults (this is not an error). Add playbook.config.json for explicit settings and .playbookignore to tune scan scope.' };
  }

  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as Partial<PlaybookConfig>;
  const config: PlaybookConfig = {
    ...defaultConfig,
    ...parsed,
    docs: { ...defaultConfig.docs, ...parsed.docs },
    analyze: { ...defaultConfig.analyze, ...parsed.analyze },
    verify: {
      ...defaultConfig.verify,
      ...parsed.verify,
      rules: {
        ...defaultConfig.verify.rules,
        ...parsed.verify?.rules
      }
    },
    memory: {
      ...defaultConfig.memory,
      ...parsed.memory,
      pressurePolicy: {
        ...defaultConfig.memory.pressurePolicy,
        ...parsed.memory?.pressurePolicy,
        watermarks: {
          ...defaultConfig.memory.pressurePolicy.watermarks,
          ...parsed.memory?.pressurePolicy?.watermarks
        }
      }
    }
  };

  return { config };
};
