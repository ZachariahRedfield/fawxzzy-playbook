import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { runKnowledge } from './index.js';
import { ExitCode } from '../../lib/cliContract.js';

const knowledgeList = vi.fn();

vi.mock('@zachariahredfield/playbook-engine', () => ({
  knowledgeList,
  knowledgeQuery: vi.fn(),
  knowledgeInspect: vi.fn(),
  knowledgeTimeline: vi.fn(),
  knowledgeProvenance: vi.fn(),
  knowledgeStale: vi.fn(),
  knowledgeCompareQuery: vi.fn(),
  knowledgeSupersession: vi.fn(),
  buildPortabilityLedger: vi.fn(),
  listPortabilityRecommendations: vi.fn(),
  listPortabilityOutcomes: vi.fn(),
  listPortabilityRecalibration: vi.fn(),
  listTransferPlanning: vi.fn(),
  listTransferReadiness: vi.fn(),
  listBlockedTransfers: vi.fn(),
  buildReviewQueue: vi.fn(),
  writeReviewQueueArtifact: vi.fn(),
  writeKnowledgeReviewReceipt: vi.fn(),
  buildReviewHandoffsArtifact: vi.fn(),
  writeReviewHandoffsArtifact: vi.fn(),
  buildReviewHandoffRoutesArtifact: vi.fn(),
  writeReviewHandoffRoutesArtifact: vi.fn(),
  buildReviewDownstreamFollowupsArtifact: vi.fn(),
  writeReviewDownstreamFollowupsArtifact: vi.fn()
}));

describe('runKnowledge longitudinal-state surface', () => {
  it('adds longitudinal_state to JSON list output', async () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'playbook-knowledge-longitudinal-'));
    fs.mkdirSync(path.join(repo, '.playbook'), { recursive: true });
    fs.writeFileSync(
      path.join(repo, '.playbook', 'longitudinal-state.json'),
      JSON.stringify({
        unresolved_risk_summary: { total_open: 4, high: 2, medium: 1, low: 1 },
        recurring_finding_clusters: [{ cluster_id: 'cluster-a', occurrences: 3, unresolved: 2 }],
        verification_lineage: { latest_approval_refs: ['.playbook/improvement-approvals.json'] },
        knowledge_lifecycle_summary: { candidate: 1, promoted: 2, superseded: 3 }
      })
    );

    knowledgeList.mockReturnValue({
      schemaVersion: '1.0',
      command: 'knowledge-list',
      filters: {},
      summary: {
        total: 0,
        byType: { evidence: 0, candidate: 0, promoted: 0, superseded: 0 },
        byStatus: { observed: 0, active: 0, stale: 0, retired: 0, superseded: 0 },
        byLifecycle: { observed: 0, candidate: 0, active: 0, stale: 0, retired: 0, superseded: 0, demoted: 0 }
      },
      knowledge: []
    });

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const code = await runKnowledge(repo, ['list'], { format: 'json', quiet: false });

    expect(code).toBe(ExitCode.Success);
    const payload = JSON.parse(String(logSpy.mock.calls[0]?.[0]));
    expect(payload.longitudinal_state).toMatchObject({
      unresolved_risk_summary: { total_open: 4, high: 2, medium: 1, low: 1 },
      recurring_finding_clusters: [{ cluster_id: 'cluster-a', occurrences: 3, unresolved: 2 }],
      verification_lineage: { latest_approval_refs: ['.playbook/improvement-approvals.json'] },
      knowledge_lifecycle_summary: { candidate: 1, promoted: 2, superseded: 3 }
    });

    logSpy.mockRestore();
  });
});
