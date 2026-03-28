---
title: Reference UI
description: The role of aioc-inspect as a reference example UI for RunRecord analysis.
---

The repository includes `aioc-inspect`, a separate reference example app located at `/apps/aioc-inspect`.

Its purpose is not to define the only possible UI for `aioc`, but to make the `RunRecord` contract concrete through a visual interface.

## Current Scope

- load one or two `RunRecord` JSON files
- inspect a single run
- compare two runs
- reconstruct handoff flow from recorded audit data

## Positioning

`aioc-inspect` is:

- experimental
- stateless
- session-only
- intended for implementors

It should be read as one possible interpretation of the run-record model, not as a hosted service or production console.
