import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ExitCode } from '../lib/cliContract.js';

const suggestPlaybookIgnore = vi.fn();
const applySafePlaybookIgnoreRecommendations = vi.fn();

vi.mock('@zachariahredfield/playbook-engine', () => ({
  suggestPlaybookIgnore,
  applySafePlaybookIgnoreRecommendations
}));

describe('runIgnore', () => {
  beforeEach(() => {
    suggestPlaybookIgnore.mockReset();
    applySafePlaybookIgnoreRecommendations.mockReset();
  });

  it('prints suggest payload in json mode', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    suggestPlaybookIgnore.mockReturnValue({
      schemaVersion: '1.0',
      command: 'ignore suggest',
      repoRoot: '/repo',
      recommendationSource: '.playbook/runtime/current/ignore-recommendations.json',
      recommendations: [],
      safe_defaults: [],
      review_required: [],
      summary: {
        total_recommendations: 0,
        safe_default_count: 0,
        review_required_count: 0,
        already_covered_count: 0
      }
    });

    const { runIgnore } = await import('./ignore.js');
    const exitCode = await runIgnore('/repo', ['suggest'], { format: 'json', quiet: false });

    expect(exitCode).toBe(ExitCode.Success);
    expect(JSON.parse(String(logSpy.mock.calls[0]?.[0])).command).toBe('ignore suggest');

    logSpy.mockRestore();
  });

  it('requires --safe-defaults for apply', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const { runIgnore } = await import('./ignore.js');
    const exitCode = await runIgnore('/repo', ['apply'], { format: 'json', quiet: false });

    expect(exitCode).toBe(ExitCode.Failure);
    expect(errorSpy).toHaveBeenCalledWith(
      'playbook ignore apply requires --safe-defaults and only auto-applies safe-default recommendations.'
    );

    errorSpy.mockRestore();
  });

  it('applies safe-default recommendations in json mode', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    applySafePlaybookIgnoreRecommendations.mockReturnValue({
      schemaVersion: '1.0',
      command: 'ignore apply',
      repoRoot: '/repo',
      recommendationSource: '.playbook/runtime/current/ignore-recommendations.json',
      targetFile: '.playbookignore',
      changed: true,
      created: true,
      applied_entries: ['.git/', 'node_modules/'],
      retained_entries: [],
      already_covered_entries: [],
      deferred_entries: ['tmp_file.txt'],
      removed_entries: [],
      summary: {
        applied_count: 2,
        retained_count: 0,
        already_covered_count: 0,
        deferred_count: 1,
        removed_count: 0
      }
    });

    const { runIgnore } = await import('./ignore.js');
    const exitCode = await runIgnore('/repo', ['apply', '--safe-defaults'], { format: 'json', quiet: false });

    expect(exitCode).toBe(ExitCode.Success);
    expect(JSON.parse(String(logSpy.mock.calls[0]?.[0])).command).toBe('ignore apply');

    logSpy.mockRestore();
  });
});
