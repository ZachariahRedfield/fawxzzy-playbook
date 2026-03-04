import { formatHuman, formatJson, verifyRepo } from '@playbook/engine';

export const runVerify = (cwd: string, options: { json: boolean; ci: boolean }): number => {
  const report = verifyRepo(cwd);

  if (options.ci || options.json) {
    console.log(formatJson(report));
    if (options.ci) {
      console.log(report.ok ? 'playbook verify: PASS' : 'playbook verify: FAIL');
    }
  } else {
    console.log(formatHuman(report));
  }

  return report.ok ? 0 : 1;
};
