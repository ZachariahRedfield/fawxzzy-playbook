const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_COMMENT_MARKER = '<!-- playbook:release-summary -->';

function readJsonIfExists(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function unique(values) {
  return [...new Set(values.filter((value) => typeof value === 'string' && value.trim().length > 0).map((value) => value.trim()))]
    .sort((left, right) => left.localeCompare(right));
}

function bumpVersion(version, bump) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(version).trim());
  if (!match) return String(version ?? '(unknown)');
  const major = Number.parseInt(match[1] ?? '0', 10);
  const minor = Number.parseInt(match[2] ?? '0', 10);
  const patch = Number.parseInt(match[3] ?? '0', 10);
  if (bump === 'major') return `${major + 1}.0.0`;
  if (bump === 'minor') return `${major}.${minor + 1}.0`;
  if (bump === 'patch') return `${major}.${minor}.${patch + 1}`;
  return String(version);
}

function toInlineList(values, fallback = '(none)') {
  return values.length > 0 ? values.join(', ') : fallback;
}

function formatAffected(plan, affectedPackages, affectedGroups) {
  if (affectedGroups.length > 0) {
    return affectedGroups.map((group) => `${group.name} (${group.packages.join(', ')})`);
  }
  return affectedPackages.map((pkg) => pkg.name);
}

function buildReleaseSummary(plan) {
  if (!plan || typeof plan !== 'object') return null;

  const packages = Array.isArray(plan.packages) ? plan.packages : [];
  const versionGroups = Array.isArray(plan.versionGroups) ? plan.versionGroups : [];
  const recommendedBump = plan.summary?.recommendedBump ?? 'none';
  const affectedPackages = packages.filter((pkg) => pkg?.recommendedBump && pkg.recommendedBump !== 'none');
  const affectedGroups = versionGroups.filter((group) => group?.recommendedBump && group.recommendedBump !== 'none');
  const currentVersionSource = affectedPackages.length > 0 ? affectedPackages : packages;
  const currentVersions = unique(currentVersionSource.map((pkg) => pkg?.currentVersion));
  const nextVersions = unique(affectedPackages.map((pkg) => bumpVersion(pkg.currentVersion, pkg.recommendedBump)));
  const decision = recommendedBump === 'none' ? 'none' : 'plan_only';
  const status = recommendedBump === 'none' ? 'no release-relevant diff' : 'release plan ready';
  const nextAction = recommendedBump === 'none'
    ? 'No version mutation required in normal PR CI; keep `pnpm playbook verify --json` as the merge gate.'
    : 'Review `.playbook/release-plan.json`; apply only through `pnpm playbook apply --from-plan .playbook/release-plan.json` in a reviewed boundary.';

  return {
    decision,
    status,
    currentVersion: toInlineList(currentVersions),
    recommendedBump,
    nextVersion: toInlineList(nextVersions),
    affected: toInlineList(formatAffected(plan, affectedPackages, affectedGroups)),
    nextAction,
  };
}

function renderMarkdown(summary, { marker, title }) {
  const lines = [];
  if (marker) lines.push(marker);
  lines.push(`## ${title}`, '', '| Field | Value |', '| --- | --- |');
  lines.push(`| Decision / status | ${summary.decision} / ${summary.status} |`);
  lines.push(`| Current version | ${summary.currentVersion} |`);
  lines.push(`| Recommended bump | ${summary.recommendedBump} |`);
  lines.push(`| Next version | ${summary.nextVersion} |`);
  lines.push(`| Affected packages / version group | ${summary.affected} |`);
  lines.push(`| Next action | ${summary.nextAction} |`);
  lines.push('', 'Artifact: `.playbook/release-plan.json`.');
  return `${lines.join('\n').trimEnd()}\n`;
}

function parseArgs(argv) {
  const options = {
    plan: '.playbook/release-plan.json',
    out: '.playbook/release-summary.md',
    commentOut: '.playbook/release-summary-comment.md',
    marker: DEFAULT_COMMENT_MARKER,
    title: 'Playbook Release Summary',
    stepSummary: process.env.GITHUB_STEP_SUMMARY || null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];
    if (token === '--plan' && next) {
      options.plan = next;
      index += 1;
    } else if (token === '--out' && next) {
      options.out = next;
      index += 1;
    } else if (token === '--comment-out' && next) {
      options.commentOut = next;
      index += 1;
    } else if (token === '--marker' && next) {
      options.marker = next;
      index += 1;
    } else if (token === '--title' && next) {
      options.title = next;
      index += 1;
    } else if (token === '--step-summary' && next) {
      options.stepSummary = next;
      index += 1;
    }
  }

  return options;
}

if (require.main === module) {
  const options = parseArgs(process.argv.slice(2));
  const plan = readJsonIfExists(path.resolve(process.cwd(), options.plan));
  const summary = buildReleaseSummary(plan);
  const outPath = path.resolve(process.cwd(), options.out);
  const commentOutPath = path.resolve(process.cwd(), options.commentOut);

  if (!summary) {
    if (fs.existsSync(outPath)) fs.rmSync(outPath);
    if (fs.existsSync(commentOutPath)) fs.rmSync(commentOutPath);
    process.exit(0);
  }

  const summaryBody = renderMarkdown(summary, { marker: null, title: options.title });
  const commentBody = renderMarkdown(summary, { marker: options.marker, title: options.title });
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, summaryBody, 'utf8');
  fs.mkdirSync(path.dirname(commentOutPath), { recursive: true });
  fs.writeFileSync(commentOutPath, commentBody, 'utf8');
  if (options.stepSummary) {
    fs.mkdirSync(path.dirname(path.resolve(options.stepSummary)), { recursive: true });
    fs.appendFileSync(path.resolve(options.stepSummary), `${summaryBody}\n`, 'utf8');
  }
  process.stdout.write(summaryBody);
}

module.exports = {
  DEFAULT_COMMENT_MARKER,
  buildReleaseSummary,
  bumpVersion,
  renderMarkdown,
  readJsonIfExists,
};
