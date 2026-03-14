# Security Baseline

`/.playbook/security-baseline.json` is the deterministic inventory of current Grype findings.

## Why this exists

The baseline captures the current vulnerability state before remediation begins so pull-request scans can stay non-blocking while risk is tracked and burned down over time.

## Artifact contract

The baseline artifact uses schema version `1.0` and structure:

- `schemaVersion`
- `kind` (`security-baseline`)
- `generatedAt`
- `findings[]`

Each finding includes:

- `package_name`
- `installed_version`
- `ecosystem`
- `vulnerability_id`
- `severity`
- `dependency_path`
- `direct_or_transitive`
- `status`

Findings are deterministically ordered by `package_name`, then `vulnerability_id`.

## Classification model

Findings are categorized into these statuses:

- `direct`
- `transitive`
- `tooling-only`
- `false-positive`
- `untriaged`

Pattern: **Baseline → classification → remediation tracking**.

Rule: **Security baseline artifacts must record existing findings before attempting automated remediation**.

Failure mode: **Skipping baseline capture leads to reactive dependency churn and unclear security posture**.

## CLI inspection

Use the following commands:

- `playbook security baseline`
- `playbook security baseline show <package>`
- `playbook security baseline summary`

As dependencies are upgraded and remediations land, this artifact should shrink over time.
