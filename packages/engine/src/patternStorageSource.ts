import path from "node:path";
import {
  resolvePatternKnowledgeStore,
  type ResolvedPatternKnowledgeStore,
} from "./patternStore.js";

export type GlobalPatternStorageSourceMetadata = {
  scope: "global_reusable_pattern_memory";
  source: {
    kind: "global-pattern-memory";
    path: string;
  };
  canonical_artifact_path: string;
  compat_artifact_paths: string[];
  resolution: ResolvedPatternKnowledgeStore["resolvedFrom"];
};

const pathRelative = (root: string, target: string): string =>
  path.relative(root, target).replaceAll("\\", "/");

export const buildGlobalPatternStorageSourceMetadata = (
  consumerRoot: string,
  options?: { playbookHome?: string },
): GlobalPatternStorageSourceMetadata => {
  const store = resolvePatternKnowledgeStore("global_reusable_pattern_memory", {
    playbookHome: options?.playbookHome,
  });
  return {
    scope: "global_reusable_pattern_memory",
    source: {
      kind: "global-pattern-memory",
      path: pathRelative(consumerRoot, store.resolvedPath),
    },
    canonical_artifact_path: store.canonicalRelativePath,
    compat_artifact_paths: store.compatibilityRelativePaths,
    resolution: store.resolvedFrom,
  };
};
