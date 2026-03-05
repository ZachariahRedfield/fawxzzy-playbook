# Architecture Diagrams

## Structure
```mermaid
flowchart TB
  n_packages["packages"]
  n_playbook["playbook"]
  n_playbook_engine["@playbook/engine"]
  n_packages --> n_playbook
  n_packages --> n_playbook_engine
```

## Dependencies
```mermaid
flowchart TB
  n_playbook["playbook"]
  n_playbook_engine["@playbook/engine"]
  n_playbook --> n_playbook_engine
```

## Legend
- Structure edges (`A --> B`) represent containment from top-level directory to package/workspace.
- Dependency edges (`A --> B`) represent internal package dependency direction (A depends on B).

## Generation
- Command: `playbook diagram --repo . --out docs/ARCHITECTURE_DIAGRAMS.md`
- Limits: maxNodes=60, maxEdges=120
- Exclusions: **/node_modules/**, **/dist/**, **/build/**, **/.next/**, **/.git/**
- Dependency source: workspace-manifests
