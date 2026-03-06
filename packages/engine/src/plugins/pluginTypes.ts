import type { Rule } from '../execution/types.js';

export type PlaybookRule = Rule;

export interface StackDetector {
  id: string;
  label: string;
  detect(repo: RepoContext): DetectionResult | null;
}

export interface RepoContext {
  repoRoot: string;
  packageJsonPath: string;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
}

export interface DetectionResult {
  confidence: number;
  evidence: string[];
}

export interface PlaybookPlugin {
  name: string;
  rules?: PlaybookRule[];
  detectors?: StackDetector[];
}
