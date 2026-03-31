import { hashCanonicalJson, toCanonicalJson } from "./canonical-json";
import type { PolicyResult } from "./policy";
import type { SuspendedProposal } from "./run-record";

export function buildSuspendedToolProposal(params: {
  runId: string;
  agentName: string;
  turn: number;
  callId: string;
  toolName: string;
  rawArguments: string;
  parsedArguments: unknown;
  policyResult: PolicyResult;
}): SuspendedProposal {
  const argsCanonicalJson = toCanonicalJson(params.parsedArguments);
  const proposalHash = hashCanonicalJson(
    toCanonicalJson({
      kind: "tool",
      agentName: params.agentName,
      toolName: params.toolName,
      argsCanonicalJson,
      reason: params.policyResult.reason,
      policyVersion: params.policyResult.policyVersion,
      expiresAt: params.policyResult.expiresAt,
    }),
  );

  return {
    timestamp: new Date().toISOString(),
    kind: "tool",
    runId: params.runId,
    turn: params.turn,
    callId: params.callId,
    agentName: params.agentName,
    proposalHash,
    reason: params.policyResult.reason,
    publicReason: params.policyResult.publicReason,
    policyVersion: params.policyResult.policyVersion,
    expiresAt: params.policyResult.expiresAt,
    metadata: params.policyResult.metadata,
    toolName: params.toolName,
    rawArguments: params.rawArguments,
    parsedArguments: params.parsedArguments,
    argsCanonicalJson,
  };
}

export function buildSuspendedHandoffProposal(params: {
  runId: string;
  fromAgentName: string;
  toAgentName: string;
  turn: number;
  callId: string;
  handoffPayload: unknown;
  policyResult: PolicyResult;
}): SuspendedProposal {
  const payloadCanonicalJson = toCanonicalJson(params.handoffPayload);
  const proposalHash = hashCanonicalJson(
    toCanonicalJson({
      kind: "handoff",
      fromAgentName: params.fromAgentName,
      toAgentName: params.toAgentName,
      payloadCanonicalJson,
      reason: params.policyResult.reason,
      policyVersion: params.policyResult.policyVersion,
      expiresAt: params.policyResult.expiresAt,
    }),
  );

  return {
    timestamp: new Date().toISOString(),
    kind: "handoff",
    runId: params.runId,
    turn: params.turn,
    callId: params.callId,
    agentName: params.fromAgentName,
    proposalHash,
    reason: params.policyResult.reason,
    publicReason: params.policyResult.publicReason,
    policyVersion: params.policyResult.policyVersion,
    expiresAt: params.policyResult.expiresAt,
    metadata: params.policyResult.metadata,
    fromAgentName: params.fromAgentName,
    toAgentName: params.toAgentName,
    handoffPayload: params.handoffPayload,
    payloadCanonicalJson,
  };
}
