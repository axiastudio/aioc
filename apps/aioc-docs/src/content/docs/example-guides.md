---
title: Examples
description: Canonical examples and how to run them from the repository root.
---

All example commands are run from the repository root.

## Live-provider examples

- `npm run example:hello`
- `npm run example:policy`
- `npm run example:approval-required`
- `npm run example:approval-evidence`
- `npm run example:tool-policy`
- `npm run example:run-record`
- `npm run example:non-regression`

Set `AIOC_EXAMPLE_PROVIDER` to `openai` or `mistral` and provide the matching API key. Optionally set `AIOC_EXAMPLE_MODEL` to override the default live model.

## Deterministic run-record utility examples

- `npm run example:rru:01-extract`
- `npm run example:rru:02-compare`
- `npm run example:rru:03-replay-strict`
- `npm run example:rru:04-replay-hybrid`

These examples are intended to remain didactic and runnable without a live provider.

## Canonical Guide

For the curated learning path, see the repository document:

- `/docs/CANONICAL-EXAMPLES.md`

For the approval model and policy-reevaluation flow, see:

- `/approval-flows/`
