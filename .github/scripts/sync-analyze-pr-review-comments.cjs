const RIGHT_SIDE = 'RIGHT';

const normalizeBody = (body, marker) => String(body || '').replace(marker, '').trim();
const keyForAnnotation = (annotation) => `${annotation.path}:${annotation.line}:${String(annotation.body || '').trim()}`;
const keyForExisting = (comment, marker) => `${comment.path}:${comment.line}:${normalizeBody(comment.body || '', marker)}`;

const parsePatchAddedLines = (patch) => {
  const addedLines = new Set();
  if (typeof patch !== 'string' || patch.length === 0) return addedLines;

  let currentRightLine = 0;
  for (const line of patch.split('\n')) {
    const hunkMatch = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (hunkMatch) {
      currentRightLine = Number(hunkMatch[1]);
      continue;
    }
    if (line.startsWith('+') && !line.startsWith('+++')) {
      addedLines.add(currentRightLine);
      currentRightLine += 1;
      continue;
    }
    if (line.startsWith('-') && !line.startsWith('---')) {
      continue;
    }
    currentRightLine += 1;
  }
  return addedLines;
};

const buildDiffAnchorIndex = (files) => {
  const byPath = new Map();
  for (const file of files) {
    if (!file || typeof file.filename !== 'string') continue;
    byPath.set(file.filename, {
      path: file.filename,
      status: file.status,
      rightLines: parsePatchAddedLines(file.patch),
    });
  }
  return byPath;
};

const validateAnnotationAnchor = (annotation, options) => {
  const { anchorIndex, expectedHeadSha, liveHeadSha, side = RIGHT_SIDE } = options;
  if (expectedHeadSha && liveHeadSha && expectedHeadSha !== liveHeadSha) {
    return {
      ok: false,
      reason: `PR head SHA changed before annotation posting (expected ${expectedHeadSha}, live ${liveHeadSha}).`,
    };
  }
  if (!annotation.path || typeof annotation.line !== 'number' || annotation.line <= 0) {
    return { ok: false, reason: 'Annotation is missing a valid file path or target line.' };
  }
  const file = anchorIndex.get(annotation.path);
  if (!file) {
    return { ok: false, reason: `File is not present in the current PR diff.` };
  }
  if (side !== RIGHT_SIDE) {
    return { ok: false, reason: `Unsupported review side ${side}; only RIGHT is posted by Playbook.` };
  }
  if (!file.rightLines.has(annotation.line)) {
    return { ok: false, reason: `Target line is not resolvable on the ${side} side of the current PR diff.` };
  }
  return { ok: true };
};

const buildFallbackBody = (annotations, marker) => {
  const lines = [
    marker,
    '### Playbook inline annotation fallback',
    '',
    'Inline PR review comments are best-effort. The following findings could not be anchored to the current diff, so they are reported here instead.',
    '',
  ];
  for (const item of annotations) {
    lines.push(`- \`${item.path}:${item.line}\` — ${item.warning}`);
    lines.push(`  - ${item.body}`);
  }
  return lines.join('\n').trimEnd();
};

async function upsertIssueComment({ github, owner, repo, issue_number, marker, body }) {
  const comments = await github.paginate(github.rest.issues.listComments, {
    owner,
    repo,
    issue_number,
    per_page: 100,
  });
  const existing = comments.find((comment) => typeof comment.body === 'string' && comment.body.includes(marker));
  if (existing) {
    await github.rest.issues.updateComment({ owner, repo, comment_id: existing.id, body });
    return { action: 'updated', id: existing.id };
  }
  const created = await github.rest.issues.createComment({ owner, repo, issue_number, body });
  return { action: 'created', id: created.data.id };
}

async function deleteIssueCommentByMarker({ github, owner, repo, issue_number, marker }) {
  const comments = await github.paginate(github.rest.issues.listComments, {
    owner,
    repo,
    issue_number,
    per_page: 100,
  });
  const existing = comments.find((comment) => typeof comment.body === 'string' && comment.body.includes(marker));
  if (!existing) return false;
  await github.rest.issues.deleteComment({ owner, repo, comment_id: existing.id });
  return true;
}

async function syncAnalyzePrReviewComments({ github, core, context, diagnostics, marker, fallbackMarker, expectedHeadSha }) {
  const { owner, repo } = context.repo;
  const pull_number = context.issue.number;
  const livePull = await github.rest.pulls.get({ owner, repo, pull_number });
  const liveHeadSha = livePull.data.head?.sha;
  const files = await github.paginate(github.rest.pulls.listFiles, {
    owner,
    repo,
    pull_number,
    per_page: 100,
  });
  const anchorIndex = buildDiffAnchorIndex(files);

  const reviewComments = await github.paginate(github.rest.pulls.listReviewComments, {
    owner,
    repo,
    pull_number,
    per_page: 100,
  });
  const playbookComments = reviewComments.filter((comment) =>
    comment.user?.type === 'Bot' && typeof comment.body === 'string' && comment.body.includes(marker),
  );

  const existingByKey = new Map(playbookComments.map((comment) => [keyForExisting(comment, marker), comment]));
  const resolvable = [];
  const fallback = [];

  for (const annotation of diagnostics) {
    if (!annotation.path || typeof annotation.line !== 'number' || !annotation.body) continue;
    const validation = validateAnnotationAnchor(annotation, { anchorIndex, expectedHeadSha, liveHeadSha, side: RIGHT_SIDE });
    if (validation.ok) {
      resolvable.push(annotation);
    } else {
      fallback.push({
        path: annotation.path,
        line: annotation.line,
        body: String(annotation.body).trim(),
        warning: validation.reason,
      });
    }
  }

  const desiredResolvableKeys = new Set(resolvable.map((annotation) => keyForAnnotation(annotation)));
  for (const [existingKey, comment] of existingByKey.entries()) {
    if (desiredResolvableKeys.has(existingKey)) continue;
    await github.rest.pulls.deleteReviewComment({ owner, repo, comment_id: comment.id });
  }

  for (const annotation of resolvable) {
    const desiredKey = keyForAnnotation(annotation);
    if (existingByKey.has(desiredKey)) continue;
    try {
      await github.rest.pulls.createReviewComment({
        owner,
        repo,
        pull_number,
        commit_id: liveHeadSha,
        path: annotation.path,
        line: annotation.line,
        side: RIGHT_SIDE,
        body: `${String(annotation.body).trim()}\n\n${marker}`,
      });
    } catch (error) {
      const status = error?.status ?? error?.response?.status;
      if (status === 422) {
        fallback.push({
          path: annotation.path,
          line: annotation.line,
          body: String(annotation.body).trim(),
          warning: 'GitHub rejected the inline diff anchor (422 Unprocessable Entity) during review comment creation.',
        });
        core?.warning?.(`Playbook inline annotation fallback for ${annotation.path}:${annotation.line} due to GitHub 422.`);
        continue;
      }
      throw error;
    }
  }

  if (fallback.length > 0) {
    const body = buildFallbackBody(fallback, fallbackMarker);
    const result = await upsertIssueComment({ github, owner, repo, issue_number: pull_number, marker: fallbackMarker, body });
    core?.info?.(`Playbook inline fallback comment ${result.action}: ${result.id}`);
  } else {
    const deleted = await deleteIssueCommentByMarker({ github, owner, repo, issue_number: pull_number, marker: fallbackMarker });
    if (deleted) core?.info?.('Removed stale Playbook inline fallback comment.');
  }

  if (core?.summary) {
    core.summary.addHeading('Playbook PR annotation delivery', 3);
    core.summary.addRaw(`<p>Inline comments posted: ${resolvable.length - fallback.filter((entry) => entry.warning.includes('422')).length}</p>`);
    core.summary.addRaw(`<p>Fallback comments posted: ${fallback.length}</p>`);
    await core.summary.write();
  }

  return { resolvable, fallback, liveHeadSha, expectedHeadSha };
}

module.exports = {
  RIGHT_SIDE,
  parsePatchAddedLines,
  buildDiffAnchorIndex,
  validateAnnotationAnchor,
  buildFallbackBody,
  syncAnalyzePrReviewComments,
};
