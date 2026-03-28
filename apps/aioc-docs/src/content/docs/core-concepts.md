---
title: Core Concepts
description: The main runtime concepts behind aioc.
---

## Agent

An `Agent` packages:

- a name
- instructions
- a model identifier
- zero or more tools
- zero or more handoffs
- optional output guardrails

## Tool

A tool is callable code exposed to the model. In `aioc`, tool execution is never a direct consequence of model output. Tool calls are proposals that still need deterministic authorization.

## Handoff

A handoff lets one agent delegate to another. Internally, `aioc` models handoffs as runtime-managed tool proposals so they can pass through the same governance boundary as normal tools.

## Policy Gate

Policies are deterministic functions that decide whether a proposed action may proceed. Current stable behavior is default deny unless a policy returns `allow`.

## RunRecord

`RunRecord` is the run-level audit artifact emitted by the runtime when recording is enabled. It captures:

- input/output trajectory items
- prompt snapshots
- request fingerprints
- policy decisions
- optional guardrail decisions
- metadata and redacted context snapshot
