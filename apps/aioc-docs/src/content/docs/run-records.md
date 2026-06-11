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
- `inputItemCount`
- `promptSnapshots`
- `requestFingerprints`
- `policyDecisions`
- `guardrailDecisions`
- `metadata`

## Input Scope

`items` contains the complete normalized run trajectory: the input that was
passed to `run(...)` plus items produced while the run executes.

`inputItemCount` marks where the original normalized input ends inside `items`.
This lets replay and inspection tools distinguish:

- prior conversation history and the current user message that started the run
- tool calls, tool outputs, and assistant messages emitted by the recorded run

For older records that do not include `inputItemCount`, replay and inspection
utilities may infer the boundary from the first request fingerprint
`messageCount`. If neither value is available, they must fall back to the
recorded `question` and the replay is not history-faithful.

## Utilities

`aioc` also exposes utilities that operate on run records:

- `extractToolCalls(...)`
- `compareRunRecords(...)`
- `replayFromRunRecord(...)`

These are intended to reduce application boilerplate for analysis and non-regression workflows.
