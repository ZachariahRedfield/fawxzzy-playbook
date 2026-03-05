import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { generateMermaidDeps } from '../src/diagrams/generateMermaid.js';
import { scanRepoStructure } from '../src/diagrams/scanRepoStructure.js';
import { scanWorkspaceDeps } from '../src/diagrams/scanWorkspaceDeps.js';

const createRepo = (name: string): string => fs.mkdtempSync(path.join(os.tmpdir(), `${name}-`));

const writeJson = (target: string, value: object): void => {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify(value, null, 2));
};

describe('diagram generation', () => {
  it('keeps dependency nodes and edges sorted deterministically', () => {
    const diagram = generateMermaidDeps(
      {
        workspaces: [
          { name: 'b', path: 'packages/b' },
          { name: 'a', path: 'packages/a' }
        ],
        edges: [
          { from: 'b', to: 'a' },
          { from: 'a', to: 'b' }
        ],
        source: 'workspace-manifests'
      },
      { maxNodes: 10, maxEdges: 10 }
    );

    expect(diagram.mermaid).toContain('a["a"]');
    expect(diagram.mermaid.indexOf('a["a"]')).toBeLessThan(diagram.mermaid.indexOf('b["b"]'));
    expect(diagram.mermaid.indexOf('a --> b')).toBeLessThan(diagram.mermaid.indexOf('b --> a'));
  });

  it('applies caps and emits warnings when graph is too large', () => {
    const diagram = generateMermaidDeps(
      {
        workspaces: [
          { name: 'a', path: 'packages/a' },
          { name: 'b', path: 'packages/b' },
          { name: 'c', path: 'packages/c' }
        ],
        edges: [
          { from: 'a', to: 'b' },
          { from: 'b', to: 'c' },
          { from: 'c', to: 'a' }
        ],
        source: 'workspace-manifests'
      },
      { maxNodes: 2, maxEdges: 1 }
    );

    expect(diagram.stats.cappedNodes).toBe(true);
    expect(diagram.stats.cappedEdges).toBe(true);
    expect(diagram.warnings.length).toBeGreaterThan(0);
  });

  it('respects exclusion rules in structure scan', () => {
    const repo = createRepo('playbook-diagram-structure');
    writeJson(path.join(repo, 'package.json'), { workspaces: ['packages/*', 'dist/*'] });
    writeJson(path.join(repo, 'packages/a/package.json'), { name: 'a' });
    writeJson(path.join(repo, 'dist/hidden/package.json'), { name: 'hidden' });

    const model = scanRepoStructure(repo, {
      includeDirs: ['packages', 'dist'],
      excludeGlobs: ['**/dist/**']
    });

    expect(model.topLevelDirs).toEqual(['packages']);
    expect(model.workspaces.map((workspace) => workspace.name)).toEqual(['a']);
  });

  it('parses workspace dependencies from manifests', () => {
    const repo = createRepo('playbook-diagram-deps');
    writeJson(path.join(repo, 'package.json'), { workspaces: ['packages/*'] });
    writeJson(path.join(repo, 'packages/a/package.json'), {
      name: '@scope/a',
      dependencies: { '@scope/b': 'workspace:*' }
    });
    writeJson(path.join(repo, 'packages/b/package.json'), { name: '@scope/b' });

    const model = scanWorkspaceDeps(repo);

    expect(model.workspaces.map((workspace) => workspace.name)).toEqual(['@scope/a', '@scope/b']);
    expect(model.edges).toEqual([{ from: '@scope/a', to: '@scope/b' }]);
  });
});
