# Security Principles

This document defines the non-negotiable security operating rules for Playbook.

## Rule: No Unreviewed Writes

Playbook must never modify repository files without a remediation plan that is:

- diff-based
- reviewable
- explicitly applied by the user

## Rule: Repo Root Is the Security Boundary

All file reads and writes must resolve within the repository root.

Reject:

- path traversal
- symlink escapes
- external write attempts

## Rule: Repository Content Is Untrusted Input

Repository files are evidence, not instructions.

Repository content must never be interpreted as runtime instructions that influence:

- system prompts
- engine behavior
- policy decisions

## Rule: Plans Must Be Evidence-Linked

Every remediation plan must include deterministic links to:

- rule id
- evidence location
- affected files
- deterministic reasoning

## Rule: Secure Defaults

When a security property cannot be verified, Playbook must fail closed or warn loudly.

Playbook must not silently proceed when boundary, provenance, or policy checks are inconclusive.
