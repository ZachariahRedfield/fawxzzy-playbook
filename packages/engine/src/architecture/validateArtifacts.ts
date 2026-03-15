import path from 'node:path';
import type { ArchitectureRegistry, ArtifactOwnership } from '@zachariahredfield/playbook-core';

export type ArchitectureValidationResult = {
  valid: boolean;
  errors: string[];
  warnings: string[];
  ownership: ArtifactOwnership[];
};

export type ValidateArtifactsOptions = {
  knownCommands: string[];
};

const SUBSYSTEM_NAME_PATTERN = /^[a-z0-9]+(?:_[a-z0-9]+)*$/;

const isValidArtifactPath = (artifact: string): boolean => {
  if (!artifact.startsWith('.playbook/')) {
    return false;
  }

  const normalized = path.posix.normalize(artifact);
  if (normalized !== artifact) {
    return false;
  }

  return !artifact.includes('..') && !path.posix.isAbsolute(artifact);
};

export const validateArtifacts = (
  registry: ArchitectureRegistry,
  options: ValidateArtifactsOptions
): ArchitectureValidationResult => {
  const errors: string[] = [];
  const warnings: string[] = [];
  const ownership: ArtifactOwnership[] = [];

  const knownCommands = new Set(options.knownCommands);
  const subsystemNames = new Set<string>();
  const subsystemNameList = registry.subsystems.map((subsystem) => subsystem.name);
  const knownSubsystems = new Set(subsystemNameList);
  const dependencyGraph = new Map<string, Set<string>>();
  const artifactOwners = new Map<string, string[]>();

  const addDependencyEdge = (from: string, to: string): void => {
    if (!dependencyGraph.has(from)) {
      dependencyGraph.set(from, new Set());
    }

    dependencyGraph.get(from)?.add(to);
  };

  for (const subsystem of registry.subsystems) {
    if (subsystemNames.has(subsystem.name)) {
      errors.push(`Duplicate subsystem name: ${subsystem.name}`);
    }

    if (!SUBSYSTEM_NAME_PATTERN.test(subsystem.name)) {
      errors.push(
        `Invalid subsystem name "${subsystem.name}". Names must be lowercase snake_case with only letters, numbers, and underscores.`
      );
    }

    subsystemNames.add(subsystem.name);

    for (const command of subsystem.commands) {
      if (!knownCommands.has(command)) {
        errors.push(`Unknown command mapping "${command}" in subsystem "${subsystem.name}".`);
      }
    }

    for (const artifact of subsystem.artifacts) {
      if (!isValidArtifactPath(artifact)) {
        errors.push(`Invalid artifact path "${artifact}" in subsystem "${subsystem.name}".`);
      }

      const owners = artifactOwners.get(artifact) ?? [];
      owners.push(subsystem.name);
      artifactOwners.set(artifact, owners);
      ownership.push({ artifact, subsystem: subsystem.name });
    }

    if (subsystem.commands.length === 0 && subsystem.artifacts.length === 0) {
      warnings.push(`Subsystem "${subsystem.name}" has no command or artifact mappings.`);
    }

    for (const upstreamName of subsystem.upstream ?? []) {
      if (!knownSubsystems.has(upstreamName)) {
        errors.push(`Unknown upstream dependency "${upstreamName}" in subsystem "${subsystem.name}".`);
        continue;
      }

      addDependencyEdge(upstreamName, subsystem.name);
    }

    for (const downstreamName of subsystem.downstream ?? []) {
      if (!knownSubsystems.has(downstreamName)) {
        errors.push(`Unknown downstream dependency "${downstreamName}" in subsystem "${subsystem.name}".`);
        continue;
      }

      addDependencyEdge(subsystem.name, downstreamName);
    }
  }

  for (const [artifact, owners] of artifactOwners.entries()) {
    if (owners.length > 1) {
      errors.push(`Duplicate artifact ownership: ${artifact} -> ${owners.join(', ')}`);
    }
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const stack: string[] = [];

  const visit = (node: string): void => {
    if (visiting.has(node)) {
      const cycleStart = stack.indexOf(node);
      const cycle = [...stack.slice(cycleStart), node];
      errors.push(`Circular subsystem dependency detected: ${cycle.join(' -> ')}`);
      return;
    }

    if (visited.has(node)) {
      return;
    }

    visiting.add(node);
    stack.push(node);

    for (const dependency of dependencyGraph.get(node) ?? []) {
      visit(dependency);
    }

    stack.pop();
    visiting.delete(node);
    visited.add(node);
  };

  for (const subsystemName of subsystemNameList) {
    visit(subsystemName);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    ownership
  };
};
