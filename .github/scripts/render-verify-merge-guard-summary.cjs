const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_COMMENT_MARKER = '<!-- playbook:merge-guard-summary -->';
const PROTECTED_DOC_RULE_PREFIX = 'protected-doc.';

function readJsonIfExists(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function unique(values) {
  return [...new Set(values.filter((value) => typeof value === 'string' && value.trim().length > 0).map((value) => value.trim()))]
    .sort((left, right) => left.localeCompare(right));
}

function parseEvidenceString(evidence) {
  if (typeof evidence !== 'string' || evidence.trim().length === 0) return {};
  const result = {};
  const keys = ['decision', 'status', 'affected_surfaces', 'blockers', 'next_action'];
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    const nextKey = keys[index + 1];
    const pattern = new RegExp(`${key}=(.*?)(?:; ${nextKey}=|$)`);
    const match = evidence.match(pattern);
    if (match) result[key] = match[1].trim();
  }
  return result;
}

function parseList(value) {
  if (typeof value !== 'string' || value === 'none') return [];
  return unique(value.split(',').map((entry) => entry.trim()));
}

function findMergeGuardFindings(verifyPayload) {
  const findings = Array.isArray(verifyPayload?.findings) ? verifyPayload.findings : [];
  return findings.filter((finding) => typeof finding?.id === 'string' && finding.id.startsWith(PROTECTED_DOC_RULE_PREFIX));
}

function buildMergeGuardSummary(verifyPayload) {
  const mergeGuardFindings = findMergeGuardFindings(verifyPayload);
  if (mergeGuardFindings.length === 0) return null;

  const parsedEvidence = mergeGuardFindings.map((finding) => parseEvidenceString(finding.evidence));
  const decisions = unique(parsedEvidence.map((entry) => entry.decision).filter(Boolean));
  const statuses = unique(parsedEvidence.map((entry) => entry.status).filter(Boolean));
  const affectedSurfaces = unique(parsedEvidence.flatMap((entry) => parseList(entry.affected_surfaces)));
  const blockers = unique(parsedEvidence.flatMap((entry) => parseList(entry.blockers)));
  const nextActions = unique(parsedEvidence.map((entry) => entry.next_action).filter(Boolean));

  return {
    findingIds: unique(mergeGuardFindings.map((finding) => finding.id)),
    decision: decisions.join(' · ') || (verifyPayload.ok ? 'pass' : 'fail_closed'),
    status: statuses.join(' · ') || (verifyPayload.ok ? 'clear' : 'merge guard blocked'),
    affectedSurfaces,
    blockers,
    nextActions,
  };
}

function toInlineList(values, fallback = '(none)') {
  return values.length > 0 ? values.join(', ') : fallback;
}

function renderMarkdown(summary, { marker, title }) {
  const lines = [];
  if (marker) lines.push(marker);
  lines.push(`## ${title}`, '', '| Field | Value |', '| --- | --- |');
  lines.push(`| Decision / status | ${summary.decision} / ${summary.status} |`);
  lines.push(`| Affected surfaces | ${toInlineList(summary.affectedSurfaces)} |`);
  lines.push(`| Blockers | ${toInlineList(summary.blockers)} |`);
  lines.push(`| Next action | ${toInlineList(summary.nextActions)} |`);
  return `${lines.join('\n').trimEnd()}\n`;
}

function parseArgs(argv) {
  const options = {
    verify: '.playbook/verify.json',
    out: '.playbook/merge-guard-comment.md',
    marker: DEFAULT_COMMENT_MARKER,
    title: 'Playbook Merge Guard',
    stepSummary: process.env.GITHUB_STEP_SUMMARY || null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];
    if (token === '--verify' && next) {
      options.verify = next;
      index += 1;
    } else if (token === '--out' && next) {
      options.out = next;
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
  const verifyPayload = readJsonIfExists(path.resolve(process.cwd(), options.verify));
  const summary = buildMergeGuardSummary(verifyPayload);
  const outPath = path.resolve(process.cwd(), options.out);
  if (!summary) {
    if (fs.existsSync(outPath)) fs.rmSync(outPath);
    process.exit(0);
  }

  const commentBody = renderMarkdown(summary, { marker: options.marker, title: options.title });
  const stepSummaryBody = renderMarkdown(summary, { marker: null, title: options.title });
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, commentBody, 'utf8');
  if (options.stepSummary) {
    fs.mkdirSync(path.dirname(path.resolve(options.stepSummary)), { recursive: true });
    fs.appendFileSync(path.resolve(options.stepSummary), `${stepSummaryBody}\n`, 'utf8');
  }
  process.stdout.write(commentBody);
}

module.exports = {
  DEFAULT_COMMENT_MARKER,
  buildMergeGuardSummary,
  parseEvidenceString,
  renderMarkdown,
  readJsonIfExists,
};
