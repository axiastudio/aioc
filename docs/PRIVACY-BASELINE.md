# Privacy Baseline (Pre-Beta)

## Purpose

This document defines the minimum privacy controls expected when adopting `aioc` before `0.1.0-beta.1`.

`aioc` provides runtime hooks and trace primitives. Storage governance and data lifecycle controls remain application responsibilities.

Latest adoption snapshot: `docs/PRIVACY-ADOPTION.md`.

## Scope

This baseline applies to:

- any use of `run(..., { record })`
- any environment where run records may contain business-sensitive or personal data

## Privacy Controls Matrix

| Control | SDK primitive | SDK default | Required application action | Verification |
| --- | --- | --- | --- | --- |
| Context minimization before persistence | `record.contextRedactor` | pass-through (no redaction) | redact, hash, or drop sensitive fields from context snapshots | unit test with redacted output + manual record inspection |
| Prompt text capture control | `record.includePromptText` | `false` | keep disabled unless there is an explicit legal and operational need | assert `promptSnapshots[*].promptText` is `undefined` by default |
| Metadata hygiene | `record.metadata` | free-form | enforce metadata allowlist; never write raw secrets, tokens, emails, or full identifiers | lint/check in adapter layer + sample records audit |
| Trace storage security | `record.sink` (adapter) | none | enforce encryption at rest/in transit and strict access controls | infra policy review + access test |
| Retention and deletion | sink-side only | none | define TTL, archival, and deletion process per data class | automated retention job + deletion test |
| Access accountability | sink-side only | none | log read/write access to stored run records | access audit logs enabled |
| Tenant boundary separation | sink-side only | none | enforce tenant-scoped partitioning and access filters | integration test with cross-tenant denial |
| Replay dataset safety | `promptSnapshots`, `requestFingerprints`, `items` | available when record enabled | build replay datasets from redacted records only | sampling + replay dry run |

## Recommended Runtime Configuration

```ts
await run(agent, input, {
  context,
  policies,
  record: {
    includePromptText: false,
    contextRedactor: (ctx) => ({
      contextSnapshot: {
        actor: {
          userId: "[redacted]",
          groups: ctx.actor.groups,
        },
      },
      contextRedacted: true,
    }),
    metadata: {
      appBuildVersion: process.env.APP_BUILD_VERSION,
      scenario: "customer-support",
    },
    sink: runRecordSink,
  },
});
```

## Metadata Guidance

Recommended metadata shape in `record.metadata`:

- `appBuildVersion`: host application build/version identifier
- `scenario`: bounded scenario identifier
- `tenantRef` (optional): pseudonymous tenant reference
- `traceClass` (optional): data classification label (`public`, `internal`, `restricted`)

Avoid storing:

- access tokens, API keys, raw session identifiers
- plain email addresses and phone numbers
- full legal names when a pseudonymous id is sufficient

## Pre-Beta Go/No-Go Checklist

All items should be true before `0.1.0-beta.1`:

1. `contextRedactor` is configured in production run-record pipelines.
2. `includePromptText` remains disabled by default.
3. Sink adapters enforce encryption and access controls.
4. Retention/deletion policy is documented and implemented.
5. Metadata allowlist and sensitive-field ban are documented.
6. At least one redaction-focused test exists in CI or release checks.
