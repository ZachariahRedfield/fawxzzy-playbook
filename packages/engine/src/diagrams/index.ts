import type { DiagramOptions } from './types.js';
import { scanRepoStructure } from './scanRepoStructure.js';
import { scanWorkspaceDeps } from './scanWorkspaceDeps.js';
import { scanImportsForInternalDeps } from './scanImports.js';
import { generateMermaidDeps, generateMermaidStructure } from './generateMermaid.js';

const DEFAULT_OPTIONS: Required<Pick<DiagramOptions, 'maxNodes' | 'maxEdges' | 'includeDirs' | 'excludeGlobs'>> = {
  maxNodes: 60,
  maxEdges: 120,
  includeDirs: ['apps', 'packages', 'tools', 'src'],
  excludeGlobs: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/.next/**', '**/.git/**']
};

export type DiagramRunOptions = DiagramOptions & {
  includeStructure?: boolean;
  includeDeps?: boolean;
  command?: string;
};

export type DiagramOutput = {
  markdown: string;
  structureWarnings: string[];
  dependencyWarnings: string[];
};

export const generateArchitectureDiagrams = (repoRoot: string, runOptions: DiagramRunOptions = {}): DiagramOutput => {
  const options: DiagramOptions = {
    maxNodes: runOptions.maxNodes ?? DEFAULT_OPTIONS.maxNodes,
    maxEdges: runOptions.maxEdges ?? DEFAULT_OPTIONS.maxEdges,
    includeDirs: runOptions.includeDirs ?? DEFAULT_OPTIONS.includeDirs,
    excludeGlobs: runOptions.excludeGlobs ?? DEFAULT_OPTIONS.excludeGlobs
  };

  const includeStructure = runOptions.includeStructure ?? true;
  const includeDeps = runOptions.includeDeps ?? true;

  const structureModel = scanRepoStructure(repoRoot, options);
  const structureDiagram = generateMermaidStructure(structureModel, options);

  const depModel = scanWorkspaceDeps(repoRoot, options);
  if (includeDeps && depModel.edges.length === 0) {
    depModel.edges = scanImportsForInternalDeps(repoRoot, depModel.workspaces, options);
    depModel.source = depModel.edges.length > 0 ? 'imports-fallback' : 'none';
  }
  const depsDiagram = generateMermaidDeps(depModel, options);

  const generationCommand = runOptions.command ?? 'playbook diagram --repo . --out docs/ARCHITECTURE_DIAGRAMS.md';

  const sections: string[] = ['# Architecture Diagrams', ''];
  if (includeStructure) {
    sections.push('## Structure', '```mermaid', structureDiagram.mermaid, '```', '');
  }
  if (includeDeps) {
    sections.push('## Dependencies', '```mermaid', depsDiagram.mermaid, '```', '');
  }

  sections.push(
    '## Legend',
    '- Structure edges (`A --> B`) represent containment from top-level directory to package/workspace.',
    '- Dependency edges (`A --> B`) represent internal package dependency direction (A depends on B).',
    '',
    '## Generation',
    `- Command: \`${generationCommand}\``,
    `- Limits: maxNodes=${options.maxNodes}, maxEdges=${options.maxEdges}`,
    `- Exclusions: ${(options.excludeGlobs ?? []).join(', ') || '(none)'}`,
    `- Dependency source: ${depModel.source}`
  );

  const allWarnings = [
    ...structureDiagram.warnings.map((warning) => `- Structure warning: ${warning}`),
    ...depsDiagram.warnings.map((warning) => `- Dependency warning: ${warning}`)
  ];

  if (allWarnings.length > 0) {
    sections.push('- Warnings:', ...allWarnings);
  }

  sections.push('');

  return {
    markdown: sections.join('\n'),
    structureWarnings: structureDiagram.warnings,
    dependencyWarnings: depsDiagram.warnings
  };
};

export { scanRepoStructure } from './scanRepoStructure.js';
export { scanWorkspaceDeps } from './scanWorkspaceDeps.js';
export { generateMermaidStructure, generateMermaidDeps } from './generateMermaid.js';
export { generateSystemMapArtifact, writeSystemMapArtifact, SYSTEM_MAP_RELATIVE_PATH, SYSTEM_MAP_SCHEMA_VERSION } from './systemMap.js';
export type { SystemMapArtifact, SystemMapLayer, SystemMapNode, SystemMapEdge } from './systemMap.js';
export type { DiagramOptions, StructureModel, DependencyModel, MermaidDiagramResult } from './types.js';
