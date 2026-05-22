import assert from "node:assert/strict";
import {
  createApprovalRequestSeed,
  findActiveApprovalGrant,
  isApprovalGrantActive,
  toActiveApprovalGrantMap,
  toApprovedProposalHashes,
  type ApprovalGrant,
  type SuspendedProposal,
} from "../../index";

const NOW = "2026-05-22T10:00:00.000Z";
const TOOL_ARGS_CANONICAL_JSON = JSON.stringify({ reportId: "rpt-1" });
const HANDOFF_PAYLOAD_CANONICAL_JSON = JSON.stringify({ caseId: "case-1" });

function createToolProposal(): SuspendedProposal {
  return {
    kind: "tool",
    timestamp: "2026-05-22T09:59:00.000Z",
    runId: "run-1",
    turn: 1,
    callId: "call-1",
    agentName: "Finance Agent",
    proposalHash: "tool-proposal-hash",
    reason: "approval_export_report",
    publicReason: "Sensitive report exports require explicit approval.",
    policyVersion: "finance-export-policy.v1",
    expiresAt: "2026-05-22T11:00:00.000Z",
    metadata: { sensitivity: "high" },
    toolName: "export_report",
    rawArguments: TOOL_ARGS_CANONICAL_JSON,
    parsedArguments: { reportId: "rpt-1" },
    argsCanonicalJson: TOOL_ARGS_CANONICAL_JSON,
  };
}

function createHandoffProposal(): SuspendedProposal {
  return {
    kind: "handoff",
    timestamp: "2026-05-22T09:59:00.000Z",
    runId: "run-1",
    turn: 1,
    callId: "handoff-1",
    agentName: "Support Agent",
    proposalHash: "handoff-proposal-hash",
    reason: "approval_escalate_sensitive_case",
    fromAgentName: "Support Agent",
    toAgentName: "Escalation Agent",
    handoffPayload: { caseId: "case-1" },
    payloadCanonicalJson: HANDOFF_PAYLOAD_CANONICAL_JSON,
  };
}

function createGrant(
  proposalHash: string,
  approvedAt: string,
  overrides: Partial<ApprovalGrant> = {},
): ApprovalGrant {
  return {
    proposalHash,
    approvedAt,
    ...overrides,
  };
}

export async function runApprovalHelpersUnitTests(): Promise<void> {
  {
    const seed = createApprovalRequestSeed(createToolProposal());

    assert.deepEqual(seed, {
      proposalHash: "tool-proposal-hash",
      kind: "tool",
      reason: "approval_export_report",
      publicReason: "Sensitive report exports require explicit approval.",
      policyVersion: "finance-export-policy.v1",
      expiresAt: "2026-05-22T11:00:00.000Z",
      resourceName: "export_report",
      canonicalPayloadJson: TOOL_ARGS_CANONICAL_JSON,
    });
  }

  {
    const seed = createApprovalRequestSeed(createHandoffProposal());

    assert.deepEqual(seed, {
      proposalHash: "handoff-proposal-hash",
      kind: "handoff",
      reason: "approval_escalate_sensitive_case",
      resourceName: "Escalation Agent",
      canonicalPayloadJson: HANDOFF_PAYLOAD_CANONICAL_JSON,
    });
  }

  {
    assert.equal(
      isApprovalGrantActive(
        createGrant("proposal-1", "2026-05-22T09:00:00.000Z"),
        NOW,
      ),
      true,
    );
    assert.equal(
      isApprovalGrantActive(
        createGrant("proposal-1", "2026-05-22T09:00:00.000Z", {
          revokedAt: "2026-05-22T09:30:00.000Z",
        }),
        NOW,
      ),
      false,
    );
    assert.equal(
      isApprovalGrantActive(
        createGrant("proposal-1", "2026-05-22T09:00:00.000Z", {
          expiresAt: "2026-05-22T09:59:59.000Z",
        }),
        NOW,
      ),
      false,
    );
  }

  {
    const older = createGrant("proposal-1", "2026-05-22T09:00:00.000Z");
    const newer = createGrant("proposal-1", "2026-05-22T09:30:00.000Z");
    const inactive = createGrant("proposal-1", "2026-05-22T09:45:00.000Z", {
      revokedAt: "2026-05-22T09:50:00.000Z",
    });

    assert.equal(
      findActiveApprovalGrant("proposal-1", [older, newer, inactive], NOW),
      newer,
    );
    assert.equal(findActiveApprovalGrant("missing", [older, newer], NOW), null);
  }

  {
    const grants = [
      createGrant("proposal-1", "2026-05-22T09:00:00.000Z"),
      createGrant("proposal-2", "2026-05-22T09:05:00.000Z", {
        expiresAt: "2026-05-22T09:30:00.000Z",
      }),
      createGrant("proposal-3", "2026-05-22T09:10:00.000Z", {
        revokedAt: "2026-05-22T09:20:00.000Z",
      }),
    ];

    assert.deepEqual(toApprovedProposalHashes(grants, NOW), ["proposal-1"]);
  }

  {
    const older = createGrant("proposal-1", "2026-05-22T09:00:00.000Z", {
      metadata: { reviewer: "alice" },
    });
    const newer = createGrant("proposal-1", "2026-05-22T09:30:00.000Z", {
      metadata: { reviewer: "bob" },
    });
    const other = createGrant("proposal-2", "2026-05-22T09:15:00.000Z");

    assert.deepEqual(toActiveApprovalGrantMap([older, newer, other], NOW), {
      "proposal-1": newer,
      "proposal-2": other,
    });
  }
}
