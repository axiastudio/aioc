---
title: Run Records
description: Run-level audit artifacts and utilities for extraction, comparison, and replay.
---

`RunRecord` is the canonical audit artifact produced by `aioc` when `run(..., { record })` is configured.

## Why It Exists

It supports:

- post-incident review
- reproducibility checks after prompt or policy changes
- structured comparison across runs
- replay-oriented regression analysis

## Main Captured Signals

- `items`
- `promptSnapshots`
- `requestFingerprints`
- `policyDecisions`
- `guardrailDecisions`
- `metadata`

## Utilities

`aioc` also exposes utilities that operate on run records:

- `extractToolCalls(...)`
- `compareRunRecords(...)`
- `replayFromRunRecord(...)`

These are intended to reduce application boilerplate for analysis and non-regression workflows.
