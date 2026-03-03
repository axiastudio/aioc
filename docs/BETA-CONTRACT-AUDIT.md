# Beta Contract Audit (Pre-Beta)

- Date: 2026-03-03
- Contract: `docs/BETA-CONTRACT.md`
- Target: `0.1.0-beta.1` freeze readiness

## Outcome

Contract alignment is **green** on frozen runtime behavior and public surface.

## Runtime Behavior Audit

| Frozen behavior | Implementation reference | Test coverage | Status |
| --- | --- | --- | --- |
| Model proposals are never execution permissions | `src/run.ts` (`evaluateToolPolicy`, `evaluateHandoffPolicy`, execution only after `decision === "allow"`) | `src/tests/unit/policy.unit.ts`, `src/tests/unit/handoff.unit.ts`, `src/tests/regression/policy-default-deny.regression.ts` | OK |
| Tools/handoffs are default-deny unless explicit allow | `src/run.ts` (missing policy => `policy_not_configured`) | `src/tests/unit/policy.unit.ts`, `src/tests/unit/handoff.unit.ts` | OK |
| Missing/thrown/invalid policy map to deterministic deny reasons | `src/run.ts` (`policy_not_configured`, `policy_error`, `invalid_policy_result`) | `src/tests/unit/policy.unit.ts`, `src/tests/unit/handoff.unit.ts` | OK |
| `run(...)` defaults to non-stream mode when `stream` is omitted | `src/run.ts` (only `options.stream === true` returns `StreamedRunResult`) | `src/tests/unit/run.unit.ts` | OK |
| Tool/handoff outputs use normalized envelope | `src/run.ts` (`toAllowedToolResultEnvelope`, `toDeniedToolResultEnvelope`) | `src/tests/unit/policy.unit.ts`, `src/tests/unit/handoff.unit.ts`, `src/tests/unit/run-record.unit.ts` | OK |
| Run record emission is best-effort and does not alter runtime success/failure | `src/run-recorder-runtime.ts` (`emit` swallows sink errors) | `src/tests/unit/run-record.unit.ts` (sink failure case) | OK |

## Public Surface Audit

| Frozen surface | Implementation reference | Status |
| --- | --- | --- |
| `Agent<TContext>` fields (`name`, `handoffDescription`, `instructions`, `promptVersion`, `model`, `modelSettings`, `tools`, `handoffs`, `outputGuardrails`) | `src/agent.ts` | OK |
| `RunContext<TContext>` shape/usage | `src/run-context.ts`, `src/run.ts` | OK |
| `run(...)` overloads + options (`context`, `maxTurns`, `logger`, `policies`, `record`) + outputs | `src/run.ts`, `src/types.ts` | OK |
| Policy contracts and helpers (`PolicyResult`, `ToolPolicyInput`, `HandoffPolicyInput`, `allow`, `deny`) | `src/policy.ts` | OK |
| Frozen error classes | `src/errors.ts` | OK |
| `RunRecord` / `RunRecordOptions` surface | `src/run-record.ts` | OK |

## Notes

1. This audit is scoped to frozen contract items only; non-frozen areas remain intentionally flexible (`logger` schema details, examples structure, provider payload internals).
2. The handoff `allow` envelope path is now explicitly asserted in unit tests (`src/tests/unit/handoff.unit.ts`).
