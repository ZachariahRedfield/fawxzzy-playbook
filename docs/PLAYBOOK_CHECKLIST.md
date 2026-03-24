# Playbook Checklist

- [ ] Updated architecture docs if behavior changed
- [ ] Added note entry with WHAT/WHY
- [ ] Verified `pnpm playbook verify` passes

## Design Integrity Checks

Advisory checks (no new hard gates):

- Does this feature reduce to explicit, enforceable rules?
- What are the invariants vs incidental detail?
- Are we storing minimal sufficient information?
- Are we deriving secondary views/state instead of persisting redundant expansions?
- Can this workflow be expressed as state -> transformation -> enforcement?
## Singleton Narrative Authorship Advisory Checks

Advisory checks (no new hard gates):

- Is the target a protected singleton narrative surface?
- Are parallel workers producing fragments/receipts instead of directly co-authoring the singleton doc?
- Has overlap detection/partitioning happened before consolidation?
- Is there a single governed consolidation step for final authorship?

