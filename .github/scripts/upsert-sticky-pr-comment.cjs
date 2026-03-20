async function upsertStickyPrComment({ github, owner, repo, issue_number, marker, body }) {
  if (!marker || typeof marker !== 'string') {
    throw new Error('upsertStickyPrComment: marker is required.');
  }
  if (!body || typeof body !== 'string') {
    throw new Error('upsertStickyPrComment: body is required.');
  }

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

module.exports = { upsertStickyPrComment };
