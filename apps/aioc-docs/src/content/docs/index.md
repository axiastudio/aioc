---
title: AIOC
description: Governance-first SDK for LLM agents with deterministic policy gates, auditable run records, and high-accountability runtime patterns.
---

`aioc` is a TypeScript SDK for agent systems where models can propose actions, but deterministic runtime components decide what is actually allowed to happen.

The project focuses on three technical areas:

- controlled execution through policy gates for tools and handoffs
- structured auditability through `RunRecord`, prompt snapshots, and request fingerprints
- verifiable iteration through replay and comparison utilities

## What This Site Covers

- a concise technical introduction to the runtime model
- the key public concepts you need to build with `aioc`
- run-record and governance-oriented documentation in a navigable format

## Source of Truth

The normative governance documents remain in the repository root under `/docs`.

This site is a documentation app living in `/apps/aioc-docs` and imports those documents into a browsable Starlight site.
