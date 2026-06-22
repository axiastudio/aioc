# RFC-0014: Compliance Evidence Pack

- Status: Draft
- Date: 2026-06-21
- Owners: aioc maintainers
- Depends on: RFC-0003, RFC-0009, RFC-0011, RFC-0012
- Related: RFC-0001, RFC-0004, RFC-0006

## Context

`aioc` already produces portable governance evidence:

- `RunRecord` captures executed runs, prompt snapshots, request fingerprints,
  policy decisions, guardrail decisions, and redacted context snapshots.
- `AgentHarnessDescriptor` describes agent graphs, tools, handoffs,
  instruction composition, and descriptor hashes.
- run-regression suites compare baseline and candidate behavior and can attach
  structured advisory judge results.
- governance events derive reduced operational facts from full run records for
  monitoring and compliance pipelines.

These artifacts are intentionally low-level and replayable. That is the right
runtime contract, but it leaves a practical gap for enterprise and public-sector
adoption: auditors, procurement teams, security reviewers, and data-protection
stakeholders often need a bounded evidence dossier rather than raw run records
or scattered JSON files.

Typical review questions include:

- Which agent, prompt, policy, model, and descriptor version produced this
  output?
- Was a high-impact action allowed, denied, or escalated for approval?
- Was human approval required before publication or external action?
- Which validation or non-regression evidence supports a harness change?
- Were prompt text, context, and tool outputs redacted before persistence or
  export?
- Which controls are directly evidenced by aioc artifacts, and which remain
  application, provider, infrastructure, or legal responsibilities?

Without a first-class evidence-pack concept, applications can still answer these
questions manually, but each implementation must invent its own structure,
claim wording, redaction posture, and artifact references.

## Decision

`aioc` should define a Compliance Evidence Pack as a derived artifact built from
existing aioc evidence sources and optional application-provided attestations.

The pack should be produced by a companion package rather than by the core
runtime:

```text
@axiastudio/aioc-compliance-evidence
```

The package should expose pure builders and renderers. It should not change
`run(...)`, policy evaluation, `RunRecord`, descriptor loading, governance-event
mapping, or regression execution.

The first public direction is:

```ts
const pack = buildComplianceEvidencePack({
  scope: {
    systemName: "training-content-ai",
    periodStart: "2026-06-01T00:00:00.000Z",
    periodEnd: "2026-06-30T23:59:59.999Z",
  },
  runRecords,
  descriptors,
  regressionSuites,
  governanceEvents,
  attestations,
});
```

The output should be a structured JSON artifact that can also be rendered to
Markdown for human review. PDF or DOCX rendering can be left to host
applications or separate tooling.

## Goals

- Convert aioc runtime artifacts into an audit-friendly dossier.
- Keep `RunRecord` as the complete source of truth.
- Preserve source references and hashes for every derived claim.
- Make evidence coverage explicit: supported, partially supported, missing, or
  application-provided.
- Separate deterministic aioc evidence from application/provider/legal
  attestations.
- Support procurement, compliance, security, and data-protection review without
  turning aioc into a compliance platform.
- Keep report generation deterministic, testable, and redaction-aware.
- Make it easy to produce repeatable evidence for a bounded system, release,
  period, tenant, or evaluation suite.

## Non-Goals

- No legal certification or legal opinion.
- No claim that using aioc alone satisfies AI Act, GDPR, NIS2, ISO, SOC, or
  contractual requirements.
- No provider compliance registry in this RFC.
- No built-in DPA, subprocessors, region, retention, or training opt-out
  authority.
- No hosted reporting service.
- No runtime policy changes.
- No automatic capture of infrastructure controls such as MFA, encryption,
  patching, incident response, backup, or network segmentation.
- No automatic proof that generated content is copyright-safe.
- No replacement for `RunRecord`, governance events, or regression results.

## Evidence Model

The pack should distinguish evidence from claims.

Evidence is a source-backed fact derived from an artifact:

```ts
export interface ComplianceEvidenceItem {
  id: string;
  kind:
    | "run_record"
    | "descriptor"
    | "policy_decision"
    | "guardrail_decision"
    | "approval"
    | "regression_summary"
    | "judge_result"
    | "governance_event"
    | "attestation";
  title: string;
  summary: string;
  source: {
    type:
      | "run_record"
      | "descriptor"
      | "regression_suite"
      | "governance_event"
      | "external";
    id?: string;
    hash?: string;
    path?: string;
    uri?: string;
  };
  sensitivity?: "public" | "internal" | "restricted";
  metadata?: Record<string, unknown>;
}
```

A claim is a review statement backed by one or more evidence items:

```ts
export type ComplianceClaimStatus =
  | "supported"
  | "partially_supported"
  | "not_supported"
  | "not_applicable"
  | "application_attested";

export interface ComplianceClaim {
  id: string;
  control: string;
  status: ComplianceClaimStatus;
  summary: string;
  evidenceIds: string[];
  gaps?: string[];
  owner?: "aioc" | "application" | "provider" | "infrastructure" | "legal";
}
```

The status vocabulary matters. A pack must be able to say that aioc provides
evidence for auditability or approval decisions while clearly marking provider
retention, model training data, certifications, or infrastructure controls as
outside aioc's direct evidence boundary unless supplied as attestations.

## Pack Shape

```ts
export interface ComplianceEvidencePack {
  schemaVersion: "aioc.compliance_evidence_pack.v0";
  id: string;
  generatedAt: string;
  scope: ComplianceEvidenceScope;
  summary: ComplianceEvidenceSummary;
  claims: ComplianceClaim[];
  evidence: ComplianceEvidenceItem[];
  sources: ComplianceEvidenceSource[];
  gaps: ComplianceGap[];
  metadata?: Record<string, unknown>;
}

export interface ComplianceEvidenceScope {
  systemName: string;
  periodStart?: string;
  periodEnd?: string;
  releaseVersion?: string;
  tenantRef?: string;
  scenario?: string;
}

export interface ComplianceEvidenceSummary {
  runRecordCount: number;
  descriptorCount: number;
  policyDecisionCount: number;
  approvalRequiredCount: number;
  guardrailTriggeredCount: number;
  regressionSuiteCount: number;
  statuses: Record<ComplianceClaimStatus, number>;
}

export interface ComplianceEvidenceSource {
  id: string;
  type:
    | "run_record"
    | "descriptor"
    | "regression_suite"
    | "governance_event"
    | "external";
  hash?: string;
  path?: string;
  uri?: string;
  metadata?: Record<string, unknown>;
}

export interface ComplianceGap {
  id: string;
  control: string;
  summary: string;
  owner: "application" | "provider" | "infrastructure" | "legal";
  suggestedEvidence?: string;
}
```

## Input Shape

```ts
export interface BuildComplianceEvidencePackInput<
  TContext = unknown,
  TDescriptor = unknown,
> {
  scope: ComplianceEvidenceScope;
  runRecords?: Array<RunRecord<TContext>>;
  descriptors?: Array<{
    id?: string;
    descriptor: TDescriptor;
    hash?: string;
    path?: string;
  }>;
  regressionSuites?: Array<{
    id?: string;
    summary: RunRegressionSummary;
    results?: Array<RunRegressionResult<TContext>>;
    path?: string;
  }>;
  governanceEvents?: GovernanceEvent[];
  attestations?: ComplianceAttestation[];
  controls?: ComplianceControlProfile;
  metadata?: Record<string, unknown>;
}

export interface ComplianceAttestation {
  id: string;
  control: string;
  title: string;
  summary: string;
  owner: "application" | "provider" | "infrastructure" | "legal";
  sourceUri?: string;
  sourcePath?: string;
  validFrom?: string;
  validUntil?: string;
  metadata?: Record<string, unknown>;
}
```

`attestations` are explicit because some requirements cannot be proven from
aioc artifacts. Examples include provider no-training commitments, data
residency, ISO/SOC certificates, DPA terms, incident response SLAs, encryption
configuration, and intellectual-property warranties.

## Control Profiles

The first package should include a generic control profile rather than a
jurisdiction-specific legal mapping.

Recommended default controls:

- runtime traceability;
- prompt and descriptor versioning;
- deterministic policy enforcement;
- approval-required outcomes;
- human review evidence;
- run-record redaction posture;
- operational governance events;
- output guardrail evidence;
- regression and validation evidence;
- unresolved application/provider/infrastructure/legal gaps.

Domain-specific profiles may be layered later:

- procurement AI questionnaire profile;
- LMS generative-content profile;
- public-sector transparency profile;
- privacy and data-minimization profile;
- security review profile.

Profiles should define claim templates and required evidence kinds. They should
not define legal conclusions.

## Derived Claim Examples

### Runtime Traceability

Supported when the pack includes run records with:

- `runId`;
- agent name;
- provider/model when available;
- prompt snapshots;
- request fingerprints;
- policy decisions;
- completion or failure status.

### Human Approval

Supported or partially supported when the pack includes:

- policy decisions with `decision = "require_approval"`;
- suspended proposal evidence or approval request seeds;
- later policy decisions showing allowed execution with approval evidence;
- optional application attestation for reviewer identity and workflow status.

`aioc` can evidence the runtime gate and proposal identity. The application must
attest reviewer workflow semantics.

### Validation And Non-Regression

Supported when the pack includes:

- regression suite summaries;
- baseline and candidate run ids;
- comparison summaries;
- optional structured judge results;
- descriptor hashes for baseline and candidate harnesses.

### Bias Or Misalignment Review

Partially supported when the pack includes:

- regression suites designed around protected or sensitive cohorts;
- guardrail decisions;
- judge findings;
- application-provided expectations.

The pack should not claim absence of discrimination unless the application
supplies a validated domain-specific audit methodology as an attestation.

### Provider Training, Retention, And Residency

Usually application-attested or not supported by aioc runtime evidence.

The pack may include model/provider names and request fingerprints, but
no-training commitments, zero data retention, subprocessors, and server
localization require provider or contract evidence.

## Renderers

The package should start with deterministic JSON and Markdown output:

```ts
export function buildComplianceEvidencePack(
  input: BuildComplianceEvidencePackInput,
): ComplianceEvidencePack;

export function renderComplianceEvidenceMarkdown(
  pack: ComplianceEvidencePack,
  options?: {
    includeEvidenceIndex?: boolean;
    includeGaps?: boolean;
  },
): string;
```

The Markdown renderer should be intentionally plain:

- executive summary;
- scope;
- claim matrix;
- key evidence;
- gaps and required attestations;
- source index.

Applications can convert Markdown to PDF, DOCX, or HTML using their own tooling
and branding.

## Privacy And Redaction

The evidence pack must be safe to share with broader review audiences only if
the source artifacts were prepared appropriately.

Package defaults should:

- avoid embedding full prompts, full context snapshots, full raw tool outputs,
  raw user messages, or raw model responses in claim summaries;
- reference source ids and hashes instead of copying sensitive payloads;
- include counts, statuses, hashes, and sanitized summaries by default;
- require explicit opt-in to include excerpts.

Recommended option shape:

```ts
export interface ComplianceEvidenceProjectionOptions {
  includePromptText?: boolean;
  includeResponses?: boolean;
  includeToolOutputs?: boolean;
  includeContextSnapshot?: boolean;
  maxExcerptChars?: number;
}
```

All inclusion options should default to `false`.

If a source `RunRecord` has `contextRedacted !== true`, the pack should create a
gap or warning unless the caller explicitly disables that check.

## Determinism

Pack generation should be deterministic for the same inputs except for
`generatedAt` and generated pack id.

Recommended id derivation:

```text
sha256(schemaVersion + "|" + scope + "|" + sorted source hashes)
```

Applications that need a stable id across regeneration can provide
`generatedAt` and `id` overrides.

Evidence item ids should be deterministic from source type, source id, control,
and source hash where available.

## Package Shape

Suggested package layout:

```text
packages/
  aioc-compliance-evidence/
    src/
      index.ts
      build-pack.ts
      render-markdown.ts
      controls.ts
      types.ts
    README.md
    package.json
```

Initial exports:

```ts
export { buildComplianceEvidencePack } from "./build-pack";
export { renderComplianceEvidenceMarkdown } from "./render-markdown";
export type {
  ComplianceEvidencePack,
  ComplianceClaim,
  ComplianceEvidenceItem,
  ComplianceAttestation,
  BuildComplianceEvidencePackInput,
} from "./types";
```

The package should depend on `@axiastudio/aioc` contracts and may optionally
peer-depend on `@axiastudio/aioc-governance-events` if governance event types
are imported directly. It should not depend on provider SDKs, PDF renderers, or
hosted compliance services.

## Relation To Existing RFCs

- RFC-0001 defines governance invariants that the pack can summarize.
- RFC-0003 provides the canonical run-level audit artifact.
- RFC-0004 and RFC-0006 provide approval-required and approval-evidence
  semantics that the pack can report.
- RFC-0009 provides reduced operational events that can be included as evidence
  sources.
- RFC-0011 provides descriptor metadata and hashes for harness identification.
- RFC-0012 provides regression summaries and judge results for validation
  evidence.

The pack is a derived reporting layer. It must not become an enforcement layer.

## Alternatives Considered

### Add Compliance Fields To RunRecord

Rejected. `RunRecord` should remain execution evidence, not a compliance report.
Compliance claims are derived from one or more source artifacts and may include
external attestations outside a single run.

### Add A Hosted Compliance Dashboard

Rejected. Hosted storage, access control, retention, report sharing, and
workflow semantics are governance-sensitive and should remain application-owned.

### Build A Provider Compliance Registry First

Deferred. Provider compliance metadata is useful, but it is volatile and often
contract-specific. The evidence pack can reference provider attestations without
making aioc the authority for them.

### Generate PDF Reports In The Package

Deferred. JSON and Markdown are enough for the first contract. PDF/DOCX/HTML
rendering can be application-specific or live in a later package if a stable
need emerges.

## Minimal Test Matrix

1. Builds a pack from one completed `RunRecord`.
2. Produces deterministic evidence ids for the same source artifacts.
3. Counts policy decisions, approval-required outcomes, guardrail triggers, and
   regression suites correctly.
4. Marks runtime traceability as supported when required run-record fields are
   present.
5. Marks human approval as partially supported when runtime approval evidence
   exists but no reviewer attestation is supplied.
6. Marks provider retention/training controls as application-attested only when
   matching attestations are supplied.
7. Creates gaps for provider, infrastructure, or legal controls that cannot be
   derived from aioc artifacts.
8. Does not include prompt text, raw context, raw tool outputs, or full model
   responses by default.
9. Emits a warning or gap for unredacted context snapshots.
10. Renders a Markdown claim matrix with stable ordering.
11. Preserves source ids, hashes, and paths in the source index.
12. Handles empty input by producing an empty pack with gaps, not false
    supported claims.

## Open Questions

1. Should the first package import governance-event types directly or accept
   them structurally to avoid a dependency on the experimental event package?
2. Should control profiles live in the package or be plain caller-provided
   templates?
3. Should Markdown rendering include short response excerpts when the source
   record explicitly includes safe public outputs?
4. Should pack generation support tenant-partitioned summaries in one pack, or
   should callers generate one pack per tenant/scope?
5. Should future renderers support signed evidence manifests or checksums for
   archived source files?

## Status

Draft. No implementation is included in this RFC.

The next useful step is a small companion-package prototype that builds a JSON
pack and Markdown claim matrix from redacted `RunRecord` values, descriptor
metadata, one regression summary, and explicit provider/infrastructure
attestations.
