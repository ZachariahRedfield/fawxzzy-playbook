declare module "@zachariahredfield/playbook-core" {
  export const analyze: (...args: unknown[]) => unknown;
  export const formatAnalyzeCi: (...args: unknown[]) => string;
  export const formatAnalyzeHuman: (...args: unknown[]) => string;
  export const formatAnalyzeJson: (...args: unknown[]) => string;
  export const verify: (...args: unknown[]) => unknown;
  export const formatHuman: (...args: unknown[]) => string;
  export const formatJson: (...args: unknown[]) => string;
}

declare module "@zachariahredfield/playbook-node" {
  export const createNodeContext: (...args: unknown[]) => unknown;
}

declare module "@zachariahredfield/playbook-engine" {
  export const loadConfig: (...args: unknown[]) => unknown;
  export const generateArchitectureDiagrams: (...args: unknown[]) => unknown;
}
