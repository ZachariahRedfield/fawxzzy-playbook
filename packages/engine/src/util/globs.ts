import { minimatch } from 'minimatch';

export const matchesAny = (file: string, patterns: string[]): boolean =>
  patterns.some((pattern) => minimatch(file, pattern, { dot: true }));
