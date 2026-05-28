---
title: Reference
description: Minimal curated reference for the most important public APIs in aioc.
---

This section is intentionally compact.

It is not a generated API reference for every exported symbol. It focuses on the public APIs that are currently most useful when building with `aioc`.

## Current Scope

- `Agent`
- harness descriptors
- `tool(...)`
- `run(...)`
- runtime logging
- policy helpers and policy configuration
- provider setup helpers
- run output events
- run-record utilities
- thread history utilities

## Related Pages

- For the run-level audit artifact itself, see [`Run Records`](../run-records/).
- For descriptor-based agent graph construction, see [`Harness Descriptor`](./harness-descriptor/).
- For runnable repository examples, see [`Examples`](../example-guides/).
- For the visual example app built on top of `RunRecord`, see [`Reference UI`](../reference-ui/).

## Stability Note

This section documents the compatibility-managed runtime surface plus implemented `0.2.0` additions.

Harness descriptors are included in `0.2.0` as an experimental sub-surface. The core runtime remains compatibility-managed; descriptor shape and loader helpers may still evolve across `0.x` minor releases with migration guidance.

Draft RFCs may still describe lifecycle refinements, stabilization work, or application-side approval patterns beyond the implemented runtime surface.
