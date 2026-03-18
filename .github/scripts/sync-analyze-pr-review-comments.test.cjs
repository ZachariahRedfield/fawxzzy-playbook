const test = require('node:test');
const assert = require('node:assert/strict');
const {
  parsePatchAddedLines,
  validateAnnotationAnchor,
  syncAnalyzePrReviewComments,
} = require('./sync-analyze-pr-review-comments.cjs');

const makeGithub = ({ headSha = 'head-1', files = [], reviewComments = [], issueComments = [], failCreate = false } = {}) => {
  const calls = { createReviewComment: [], createComment: [], updateComment: [], deleteReviewComment: [], deleteComment: [] };
  const github = {
    rest: {
      pulls: {
        get: async () => ({ data: { head: { sha: headSha } } }),
        listFiles: async () => ({ data: files }),
        listReviewComments: async () => ({ data: reviewComments }),
        createReviewComment: async (payload) => {
          calls.createReviewComment.push(payload);
          if (failCreate) {
            const error = new Error('unprocessable');
            error.status = 422;
            throw error;
          }
          return { data: { id: calls.createReviewComment.length } };
        },
        deleteReviewComment: async (payload) => { calls.deleteReviewComment.push(payload); return { data: {} }; },
      },
      issues: {
        listComments: async () => ({ data: issueComments }),
        createComment: async (payload) => { calls.createComment.push(payload); return { data: { id: 900 + calls.createComment.length } }; },
        updateComment: async (payload) => { calls.updateComment.push(payload); return { data: {} }; },
        deleteComment: async (payload) => { calls.deleteComment.push(payload); return { data: {} }; },
      },
    },
    paginate: async (fn, args) => {
      const result = await fn(args);
      return result.data;
    },
  };
  return { github, calls };
};

const core = {
  info() {},
  warning() {},
  summary: { addHeading() { return this; }, addRaw() { return this; }, async write() {} },
};
const context = { repo: { owner: 'o', repo: 'r' }, issue: { number: 1 } };

test('parsePatchAddedLines collects right-side added line anchors', () => {
  const lines = parsePatchAddedLines('@@ -1,2 +10,3 @@\n a\n+b\n c\n+d');
  assert.deepEqual([...lines], [11, 13]);
});

test('validateAnnotationAnchor accepts resolvable inline comment anchors', () => {
  const anchorIndex = new Map([['src/file.ts', { rightLines: new Set([7]) }]]);
  assert.deepEqual(
    validateAnnotationAnchor({ path: 'src/file.ts', line: 7, body: 'note' }, { anchorIndex, expectedHeadSha: 'a', liveHeadSha: 'a' }),
    { ok: true },
  );
});

test('validateAnnotationAnchor rejects stale diff line and missing file anchors', () => {
  const anchorIndex = new Map([['src/file.ts', { rightLines: new Set([7]) }]]);
  assert.equal(validateAnnotationAnchor({ path: 'src/file.ts', line: 9, body: 'note' }, { anchorIndex, expectedHeadSha: 'a', liveHeadSha: 'a' }).ok, false);
  assert.equal(validateAnnotationAnchor({ path: 'src/missing.ts', line: 7, body: 'note' }, { anchorIndex, expectedHeadSha: 'a', liveHeadSha: 'a' }).ok, false);
});

test('syncAnalyzePrReviewComments posts resolvable inline comments', async () => {
  const { github, calls } = makeGithub({
    files: [{ filename: 'src/file.ts', patch: '@@ -1 +1,2 @@\n a\n+b' }],
  });
  const result = await syncAnalyzePrReviewComments({
    github,
    core,
    context,
    diagnostics: [{ path: 'src/file.ts', line: 2, body: 'Playbook Warning: test' }],
    marker: '<!-- inline -->',
    fallbackMarker: '<!-- fallback -->',
    expectedHeadSha: 'head-1',
  });
  assert.equal(calls.createReviewComment.length, 1);
  assert.equal(calls.createComment.length, 0);
  assert.equal(result.fallback.length, 0);
});

test('syncAnalyzePrReviewComments falls back when line is stale after rebase/edit', async () => {
  const { github, calls } = makeGithub({
    files: [{ filename: 'src/file.ts', patch: '@@ -1 +1,2 @@\n a\n+b' }],
  });
  const result = await syncAnalyzePrReviewComments({
    github,
    core,
    context,
    diagnostics: [{ path: 'src/file.ts', line: 9, body: 'Playbook Warning: stale line' }],
    marker: '<!-- inline -->',
    fallbackMarker: '<!-- fallback -->',
    expectedHeadSha: 'head-1',
  });
  assert.equal(calls.createReviewComment.length, 0);
  assert.equal(calls.createComment.length, 1);
  assert.match(calls.createComment[0].body, /src\/file.ts:9/);
  assert.equal(result.fallback.length, 1);
});

test('syncAnalyzePrReviewComments falls back when GitHub rejects inline comment creation with 422', async () => {
  const { github, calls } = makeGithub({
    files: [{ filename: 'src/file.ts', patch: '@@ -1 +1,2 @@\n a\n+b' }],
    failCreate: true,
  });
  const result = await syncAnalyzePrReviewComments({
    github,
    core,
    context,
    diagnostics: [{ path: 'src/file.ts', line: 2, body: 'Playbook Warning: retry fallback' }],
    marker: '<!-- inline -->',
    fallbackMarker: '<!-- fallback -->',
    expectedHeadSha: 'head-1',
  });
  assert.equal(calls.createReviewComment.length, 1);
  assert.equal(calls.createComment.length, 1);
  assert.equal(result.fallback.length, 1);
});

test('syncAnalyzePrReviewComments falls back when file is not present in diff or head SHA is stale', async () => {
  const { github, calls } = makeGithub({ files: [] });
  const result = await syncAnalyzePrReviewComments({
    github,
    core,
    context,
    diagnostics: [{ path: 'src/missing.ts', line: 3, body: 'Playbook Warning: missing file' }],
    marker: '<!-- inline -->',
    fallbackMarker: '<!-- fallback -->',
    expectedHeadSha: 'old-head',
  });
  assert.equal(calls.createReviewComment.length, 0);
  assert.equal(calls.createComment.length, 1);
  assert.match(calls.createComment[0].body, /old-head/);
  assert.equal(result.fallback.length, 1);
});
