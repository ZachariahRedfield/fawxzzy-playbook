import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { cleanupSessionSnapshots } from '../src/sessions/cleanup.js';

const makeFile = (dir: string, name: string, daysAgo: number): string => {
  const filePath = path.join(dir, name);
  fs.writeFileSync(filePath, '{}\n', 'utf8');
  const ts = Date.now() - daysAgo * 24 * 60 * 60 * 1000;
  fs.utimesSync(filePath, ts / 1000, ts / 1000);
  return filePath;
};

describe('session cleanup', () => {
  it('deletes by age and max count with deterministic retention', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'playbook-cleanup-'));
    makeFile(dir, 'old.json', 40);
    makeFile(dir, 'recent-a.json', 1);
    makeFile(dir, 'recent-b.json', 2);

    const result = cleanupSessionSnapshots({ sessionsDir: dir, maxDays: 30, maxCount: 1 });

    expect(result.keptCount).toBe(1);
    expect(result.deletedCount).toBe(2);
    expect(fs.existsSync(path.join(dir, 'old.json'))).toBe(false);
  });

  it('supports dry-run without deleting files', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'playbook-cleanup-dry-'));
    const file = makeFile(dir, 'old.json', 100);

    const result = cleanupSessionSnapshots({ sessionsDir: dir, maxDays: 30, maxCount: 50, dryRun: true });

    expect(result.deletedCount).toBe(1);
    expect(fs.existsSync(file)).toBe(true);
  });

  it('runs deterministic hygiene pipeline with report details', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'playbook-cleanup-hygiene-'));
    const sessionPath = path.join(dir, 'session.json');
    const longText = `Decision rationale ${'x'.repeat(500)}`;

    fs.writeFileSync(
      sessionPath,
      `${JSON.stringify(
        {
          sessionId: 'session-1',
          source: { kind: 'chat-text', name: 'chat.md' },
          createdAt: new Date().toISOString(),
          decisions: [
            { id: 'd1', decision: ' Use PostgreSQL ', rationale: longText, alternatives: ['  sqlite  ', 'sqlite'], evidence: ['n/a'] },
            { id: 'd2', decision: 'use postgresql' }
          ],
          constraints: ['TBD', 'keep tests', 'keep tests'],
          openQuestions: ['  what about caching?  ', 'what about caching?'],
          artifacts: ['none', 'docs/ADR-001.md'],
          nextSteps: ['-', 'ship it'],
          tags: [' backend ', 'backend']
        },
        null,
        2
      )}\n`,
      'utf8'
    );

    const result = cleanupSessionSnapshots({ sessionsDir: dir, hygiene: true, maxEntryLength: 120 });

    expect(result.hygieneReport.enabled).toBe(true);
    expect(result.hygieneReport.processedArtifacts).toBe(1);
    expect(result.hygieneReport.itemsRemoved.deduplicated).toBeGreaterThan(0);
    expect(result.hygieneReport.itemsRemoved.junk).toBeGreaterThan(0);
    expect(result.hygieneReport.itemsCompacted.truncated).toBeGreaterThan(0);
    expect(result.hygieneReport.bytesReduced).toBeGreaterThan(0);

    const cleaned = JSON.parse(fs.readFileSync(sessionPath, 'utf8')) as Record<string, unknown>;
    expect(cleaned.constraints).toEqual(['keep tests']);
    expect(cleaned.tags).toEqual(['backend']);
  });

  it('reports unparseable snapshots as warnings without deletion', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'playbook-cleanup-hygiene-parse-'));
    const badFile = path.join(dir, 'bad.json');
    fs.writeFileSync(badFile, '{not-json}\n', 'utf8');

    const result = cleanupSessionSnapshots({ sessionsDir: dir, hygiene: true, dryRun: true });

    expect(result.hygieneReport.warnings).toHaveLength(1);
    expect(result.hygieneReport.files[0]?.parseable).toBe(false);
    expect(fs.existsSync(badFile)).toBe(true);
  });
});
