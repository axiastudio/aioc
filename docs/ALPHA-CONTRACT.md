# Alpha Contract (0.1.x)

## Purpose

This document defines the minimum behavioral contract that `aioc` commits to during the alpha phase.

Alpha still allows breaking changes, but changes to items in this contract must be explicit, versioned, and documented.

## Version Scope

This contract applies to `0.1.x-alpha.*` releases.

For the pre-beta freeze baseline, see `docs/BETA-CONTRACT.md`.

## Contracted Runtime Behavior

1. Model proposals are not execution permissions.
2. Tool calls and handoff transitions are default-deny unless a policy explicitly returns `allow`.
3. Missing policy, thrown policy, or invalid policy result must resolve to deterministic deny reasons.
4. `run(...)` defaults to non-stream mode when `stream` is omitted.

## Contracted Policy Surface

The policy result shape includes:

- `decision: "allow" | "deny"` (required)
- `reason: string` (required, non-empty)
- `publicReason?: string` (optional)
- `denyMode?: "throw" | "tool_result"` (optional)
- `policyVersion?: string` (optional)
- `metadata?: Record<string, unknown>` (optional)

Semantics:

- `denyMode` omitted is equivalent to `"throw"`.
- `publicReason` is intended for model/user-facing denied output.
- `reason` is the deterministic policy/audit reason.

## Contracted Tool/Handoff Output Envelope

All tool and handoff call outputs are normalized as:

```ts
interface ToolResultEnvelope {
  status: "ok" | "denied";
  code: string | null;
  publicReason: string | null;
  data: unknown | null;
}
```

Semantics:

- Allow path: `status = "ok"`, `data = tool/handoff payload`.
- Soft deny path (`denyMode = "tool_result"`): `status = "denied"`, `code = reason`, `publicReason` from policy (or runtime fallback), `data = null`.
- Hard deny path (`denyMode = "throw"` or omitted): typed denial error is raised.

## Contracted Run Record Behavior

1. `run(..., { record })` emits at most one consolidated `RunRecord` per run.
2. Record emission is best-effort; sink failures must not change run success/failure semantics.
3. Policy decisions are included with deterministic reasons.
4. Prompt snapshots are captured per turn with stable `promptHash` and optional `promptVersion`.
5. Request fingerprints are captured per turn with stable SHA-256 hashes (`requestHash`, segmented hashes) plus `runtimeVersion` and `fingerprintSchemaVersion`.
6. `items` preserve normalized tool/handoff output envelopes.
7. `contextRedactor` is applied before persistence when configured.

## Out of Contract in Alpha

The following are intentionally unstable during alpha:

- Logger event schema details and event naming.
- Non-core metadata field conventions (except the recommended `metadata.appBuildVersion` correlation field).
- Example files and tutorial structure.
- Error message text that is not part of explicit typed error semantics.

## Change Policy During Alpha

For any breaking change affecting this contract:

1. Bump prerelease version (`alpha`).
2. Update this document in the same change.
3. Mention the break in release notes.
