# Changelog

## Unreleased

### Added

- Added RFC-0012 run-regression core types, `runRegressionCase(...)`,
  `runRegressionSuite(...)`, and `summarizeRunRegressionResults(...)` for
  regression checks and CI-friendly summaries.

## 0.2.5 - 2026-06-11

### Added

- Added `RunRecord.inputItemCount` to record the initial normalized input scope
  used by history-faithful replay and inspection tools.

### Changed

- Updated `replayFromRunRecord(...)` to replay from the recorded initial input
  by default, with legacy fallback to the first request fingerprint
  `messageCount` and explicit `inputMode: "question"` support.

### Fixed

- Prevented strict/hybrid replay from nesting recorded allow tool result
  envelopes when reusing persisted tool outputs.

## @axiastudio/aioc-inspect-ui 0.1.2 - 2026-06-11

### Changed

- Updated RunRecord scope reconstruction to prefer `inputItemCount` before the
  legacy first request fingerprint `messageCount` fallback.

## 0.2.4 - 2026-06-09

Release that introduces experimental governance-event packages and the first
OpenTelemetry Logs adapter without changing the core runtime surface.

### Added

- Added experimental `@axiastudio/aioc-governance-events` package with the
  RFC-0009 canonical event schema, `toGovernanceEvents(...)` mapper, exporter
  contract, and `RunRecord` sink helper.
- Added experimental `@axiastudio/aioc-export-otel` package that maps
  governance events to OpenTelemetry Logs, with a console smoke exporter
  example and a SigNoz/OTLP HTTP smoke example.

### Changed

- Registered companion packages under npm workspaces for package-level build,
  test, and release workflows.

### Documentation

- Added a compact `composeToolPolicies(...)` basic example.

## 0.2.3 - 2026-06-05

Release that adds policy composition helpers for exact-name tool and handoff
policy dispatch.

### Added

- Added `composeToolPolicies(...)` and `composeHandoffPolicies(...)` helpers
  for exact-name policy dispatch with optional `"*"` fallback policies.

## 0.2.2 - 2026-06-02

Release that completes the supported `0.2.x` Agent Harness Descriptor surface
with reusable and conditional instruction composition.

### Added

- Added descriptor instruction composition with `instruction_parts`,
  `instructions_sequence`, and boolean `where` gates.

### Changed

- Promoted RFC-0011 Agent Harness Descriptor out of experimental status into
  the supported `0.2.x` API surface.

### Documentation

- Updated the harness descriptor example to use the official descriptor loader
  and demonstrate reusable instruction parts with conditional instruction
  blocks.

## 0.2.1 - 2026-05-28

Patch release that realigns the `0.2.x` line with the current `main` history
after `0.2.0` was published from the descriptor release branch.

### Fixed

- Restored the `0.1.2` approval evidence helpers in the `0.2.x` release line.
- Preserved the Agent Harness Descriptor APIs and loader helpers introduced by
  `0.2.0`.

## 0.2.0 - 2026-05-28

### Added

- Initial agent harness descriptor APIs: `buildAgentHarness(...)`,
  `hashAgentHarnessDescriptor(...)`, descriptor metadata, registry-backed tool
  binding, context defaults, and instruction context references.
- Agent harness descriptor loaders:
  `loadAgentHarnessDescriptor(...)` and
  `loadAgentHarnessDescriptorFromFile(...)` materialize local
  `instructions_file` / `instructions_files` prompt files before
  `buildAgentHarness(...)`.

### Documentation

- Added harness descriptor reference documentation and an RFC-0011 governance
  entry.

## 0.1.2 - 2026-05-22

Stable patch release for application-owned approval evidence handling.

### Added

- Approval evidence helpers for application-owned approval workflows: `createApprovalRequestSeed(...)`, `isApprovalGrantActive(...)`, `findActiveApprovalGrant(...)`, `toApprovedProposalHashes(...)`, and `toActiveApprovalGrantMap(...)`.

## 0.1.1 - 2026-05-22

Stable patch release for provider compatibility, thread-history helpers, and
stream-output ergonomics.

### Added

- Thread history utilities for application-owned conversation state: `toThreadHistory(...)`, `appendUserMessage(...)`, `replaceThreadHistory(...)`, and `applyRunResultHistory(...)`.
- Run output stream adapter `toRunOutputEvents(...)` for streaming text deltas while collecting final output, history, last agent, and paired tool calls.

### Fixed

- OpenAI chat completions serialize resolved `Agent.instructions` as `developer` messages, while Mistral and the shared chat-completions base continue to use `system`.

### Documentation

- Clarified provider-specific instruction role mapping in the Agent and Providers reference pages.
- Marked the suspended proposal lifecycle RFC as accepted.

## @axiastudio/aioc-inspect-ui 0.1.1 - 2026-05-28

### Fixed

- Allow `@axiastudio/aioc@0.2.x` in peer dependencies.

## @axiastudio/aioc-inspect-ui 0.1.0 - 2026-04-24

First public-ready release of the reusable AIOC inspect UI package.

### Added

- Published package metadata for `@axiastudio/aioc-inspect-ui`.
- Reusable React components for `RunRecord` inspection and comparison.
- `createInspectRecord(...)` helper for adapting application-owned `RunRecord` values to the UI.
- Package build output under `dist` with JavaScript and TypeScript declarations.
- README guidance for Tailwind CSS v4 consumers.

### Notes

- This release does not change the stable core SDK surface of `@axiastudio/aioc`.
- Consumers must provide `@axiastudio/aioc`, `react`, and `react-dom` as peer dependencies.
- The package does not currently ship a standalone stylesheet; Tailwind consumers should include the package output in their source scan.

## 0.1.0 - 2026-04-15

First stable release of `@axiastudio/aioc`.

### Stable Surface

- Core runtime APIs are now treated as stable: `Agent`, `tool(...)`, `run(...)`, policy helpers, logger hooks, run-record hooks, and run-record utilities.
- Public documentation has been aligned with the exported contract.
- `RunRecord` plus replay/compare workflows are part of the stable SDK story.
- Draft RFCs for approval evidence and thread history remain draft and are not part of the stable runtime contract.

### Migration Notes

- `resultMode` is the only supported non-allow delivery-mode field in `PolicyResult`.
- Legacy `denyMode` is no longer supported. Runtime rejects it deterministically with `deprecated_policy_field_denyMode`.
- Migrate policy code from:

```ts
deny("tool_not_allowlisted", { denyMode: "tool_result" });
```

to:

```ts
deny("tool_not_allowlisted", { resultMode: "tool_result" });
```

### Validation

- `npm run test:ci:stability`
- `npm run docs:build`
- `npm run build:package`
