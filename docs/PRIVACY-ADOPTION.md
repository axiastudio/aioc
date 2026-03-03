# Privacy Adoption Report (Pre-Beta)

- Date: 2026-03-03
- Baseline: `docs/PRIVACY-BASELINE.md`
- Scope: `aioc` SDK pre-beta (`0.1.0-beta.1` readiness)

## Outcome

Privacy baseline is **adopted for SDK-owned controls** and **explicitly delegated for application-owned controls**.

## Checklist Mapping

| Baseline checklist item | Status | Evidence |
| --- | --- | --- |
| 1. `contextRedactor` configured in production run-record pipelines | ADOPTED (SDK support + CI evidence) | `src/run-recorder-runtime.ts`, `src/tests/regression/privacy-baseline.regression.ts`, `src/tests/unit/run-record.unit.ts` |
| 2. `includePromptText` disabled by default | ADOPTED | `src/run-recorder-runtime.ts` (`includePromptText ?? false`), `src/tests/regression/privacy-baseline.regression.ts`, `src/tests/unit/run-record.unit.ts` |
| 3. Sink adapters enforce encryption/access controls | DELEGATED (app responsibility) | requirement documented in `docs/PRIVACY-BASELINE.md` |
| 4. Retention/deletion policy documented and implemented | DELEGATED (app responsibility) | requirement documented in `docs/PRIVACY-BASELINE.md` |
| 5. Metadata allowlist and sensitive-field ban documented | ADOPTED (documentation + example shape) | `docs/PRIVACY-BASELINE.md` ("Metadata Guidance"), `src/tests/regression/privacy-baseline.regression.ts` |
| 6. At least one redaction-focused test in CI/release checks | ADOPTED | `src/tests/regression/privacy-baseline.regression.ts` executed by `npm run test:ci` |

## Notes

1. The SDK provides privacy hooks and safe defaults; infrastructure/privacy governance controls remain in host applications.
2. Release gating should verify app-side controls (encryption, retention, access accountability) in the deployment repository, not in `aioc`.
