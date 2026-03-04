import { analyzeRepo } from '@playbook/engine';

export const runAnalyze = (cwd: string, asJson: boolean): number => {
  const result = analyzeRepo(cwd);
  if (asJson) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(result.summary);
  }
  return 0;
};
