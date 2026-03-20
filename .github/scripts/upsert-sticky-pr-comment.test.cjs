const test = require('node:test');
const assert = require('node:assert/strict');
const { upsertStickyPrComment } = require('./upsert-sticky-pr-comment.cjs');

const makeGithub = ({ comments = [] } = {}) => {
  const calls = { createComment: [], updateComment: [] };
  const github = {
    rest: {
      issues: {
        listComments: async () => ({ data: comments }),
        createComment: async (payload) => {
          calls.createComment.push(payload);
          return { data: { id: 700 + calls.createComment.length } };
        },
        updateComment: async (payload) => {
          calls.updateComment.push(payload);
          return { data: {} };
        },
      },
    },
    paginate: async (fn, args) => {
      const result = await fn(args);
      return result.data;
    },
  };
  return { github, calls };
};

test('upsertStickyPrComment creates a new comment when no marker match exists', async () => {
  const { github, calls } = makeGithub();
  const result = await upsertStickyPrComment({
    github,
    owner: 'o',
    repo: 'r',
    issue_number: 1,
    marker: '<!-- marker -->',
    body: '<!-- marker -->\nhello',
  });

  assert.equal(result.action, 'created');
  assert.equal(calls.createComment.length, 1);
  assert.equal(calls.updateComment.length, 0);
});

test('upsertStickyPrComment updates the existing marker-matched comment', async () => {
  const { github, calls } = makeGithub({
    comments: [{ id: 42, body: 'before\n<!-- marker -->' }],
  });
  const result = await upsertStickyPrComment({
    github,
    owner: 'o',
    repo: 'r',
    issue_number: 1,
    marker: '<!-- marker -->',
    body: '<!-- marker -->\nafter',
  });

  assert.equal(result.action, 'updated');
  assert.equal(result.id, 42);
  assert.equal(calls.createComment.length, 0);
  assert.equal(calls.updateComment.length, 1);
  assert.equal(calls.updateComment[0].comment_id, 42);
});
