import {
  HandoffApprovalRequiredError,
  HandoffPolicyDeniedError,
  ToolCallApprovalRequiredError,
  ToolCallPolicyDeniedError,
} from "./errors";
import type { PolicyResult, PolicyResultMode } from "./policy";
import type { SuspendedProposal } from "./run-record";

export type ToolResultEnvelopeStatus = "ok" | "denied" | "approval_required";

export interface ToolResultEnvelope {
  status: ToolResultEnvelopeStatus;
  code: string | null;
  publicReason: string | null;
  data: unknown | null;
}

export function createDeniedPolicyResult(
  reason: string,
  metadata?: Record<string, unknown>,
): PolicyResult {
  return {
    decision: "deny",
    reason,
    resultMode: "throw",
    metadata,
  };
}

export function toAllowedToolResultEnvelope(data: unknown): ToolResultEnvelope {
  return {
    status: "ok",
    code: null,
    publicReason: null,
    data,
  };
}

function toBlockedToolResultEnvelope(
  policyResult: PolicyResult,
): ToolResultEnvelope {
  return {
    status:
      policyResult.decision === "require_approval"
        ? "approval_required"
        : "denied",
    code: policyResult.reason,
    publicReason:
      policyResult.publicReason?.trim() ||
      (policyResult.decision === "require_approval"
        ? "Action requires approval."
        : "Action not allowed."),
    data: null,
  };
}

export function materializePolicyResult(
  policyResult: PolicyResult,
): PolicyResult {
  if (
    policyResult.decision === "allow" ||
    typeof policyResult.resultMode !== "undefined"
  ) {
    return policyResult;
  }

  return {
    ...policyResult,
    resultMode: "throw",
  };
}

export function resolveResultMode(
  policyResult: PolicyResult,
): PolicyResultMode {
  return policyResult.resultMode ?? "throw";
}

export function handleBlockedPolicyResult(
  params:
    | {
        kind: "tool";
        toolName: string;
        policyResult: PolicyResult;
        suspendedProposal?: SuspendedProposal;
      }
    | {
        kind: "handoff";
        fromAgent: string;
        toAgent: string;
        policyResult: PolicyResult;
        suspendedProposal?: SuspendedProposal;
      },
): ToolResultEnvelope {
  const { policyResult } = params;
  if (policyResult.decision === "allow") {
    throw new Error(
      "Blocked policy result handler received an allow decision.",
    );
  }

  if (resolveResultMode(policyResult) === "tool_result") {
    return toBlockedToolResultEnvelope(policyResult);
  }

  if (policyResult.decision === "require_approval") {
    if (!params.suspendedProposal) {
      throw new Error(
        "Approval-required policy result is missing a suspended proposal.",
      );
    }

    if (params.kind === "tool") {
      throw new ToolCallApprovalRequiredError({
        toolName: params.toolName,
        policyResult,
        suspendedProposal: params.suspendedProposal,
      });
    }

    throw new HandoffApprovalRequiredError({
      fromAgent: params.fromAgent,
      toAgent: params.toAgent,
      policyResult,
      suspendedProposal: params.suspendedProposal,
    });
  }

  if (params.kind === "tool") {
    throw new ToolCallPolicyDeniedError({
      toolName: params.toolName,
      policyResult,
    });
  }

  throw new HandoffPolicyDeniedError({
    fromAgent: params.fromAgent,
    toAgent: params.toAgent,
    policyResult,
  });
}
