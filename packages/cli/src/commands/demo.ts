import { ExitCode } from '../lib/cliContract.js';

type DemoContract = {
  schemaVersion: '1.0';
  command: 'demo';
  repository: {
    name: 'playbook-demo';
    url: 'https://github.com/ZachariahRedfield/playbook-demo';
  };
  workflow: string[];
  expectedInitialFindings: {
    deterministicFindings: number;
    firstVerifyPasses: boolean;
    fixAppliesSafeRemediations: boolean;
    finalVerifyPasses: boolean;
  };
  demonstrates: string[];
  summary: string;
};

const DEMO_REPOSITORY_URL = 'https://github.com/ZachariahRedfield/playbook-demo';

const DEMO_WORKFLOW: string[] = [
  `git clone ${DEMO_REPOSITORY_URL}`,
  'cd playbook-demo',
  'npm install',
  'npx playbook analyze',
  'npx playbook verify',
  'npx playbook explain',
  'npx playbook fix',
  'npx playbook verify'
];

const DEMONSTRATES: string[] = [
  'repository understanding',
  'deterministic rule enforcement',
  'explainable findings',
  'safe remediation workflow'
];

const collectDemoContract = (): DemoContract => ({
  schemaVersion: '1.0',
  command: 'demo',
  repository: {
    name: 'playbook-demo',
    url: DEMO_REPOSITORY_URL
  },
  workflow: DEMO_WORKFLOW,
  expectedInitialFindings: {
    deterministicFindings: 5,
    firstVerifyPasses: false,
    fixAppliesSafeRemediations: true,
    finalVerifyPasses: true
  },
  demonstrates: DEMONSTRATES,
  summary:
    'Official Playbook onboarding flow: clone the demo repository, run deterministic analysis/verify, inspect findings, apply safe fixes, and confirm final verification passes.'
});

const printText = (result: DemoContract): void => {
  console.log('Playbook Demo');
  console.log('');
  console.log('Repository:');
  console.log(result.repository.url);
  console.log('');
  console.log('Quick start:');
  for (const step of result.workflow) {
    console.log(step);
  }

  console.log('');
  console.log('Expected initial state:');
  console.log(`- ${result.expectedInitialFindings.deterministicFindings} deterministic findings on fresh clone`);
  console.log('- first verify fails');
  console.log('- fix applies safe remediations');
  console.log('- final verify passes');
  console.log('');
  console.log('What this demonstrates:');
  for (const point of result.demonstrates) {
    console.log(`- ${point}`);
  }
};

export const runDemo = async (_cwd: string, options: { format: 'text' | 'json'; quiet: boolean }): Promise<number> => {
  const result = collectDemoContract();

  if (options.format === 'json') {
    console.log(JSON.stringify(result, null, 2));
    return ExitCode.Success;
  }

  if (!options.quiet) {
    printText(result);
  }

  return ExitCode.Success;
};
