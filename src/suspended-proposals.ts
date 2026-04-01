import type { PolicyResult } from "./policy";
import {
  createHandoffProposalFingerprint,
  createToolProposalFingerprint,
} from "./proposal-hashing";
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
  const { argsCanonicalJson, proposalHash } = createToolProposalFingerprint({
    agentName: params.agentName,
    toolName: params.toolName,
    parsedArguments: params.parsedArguments,
  });

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
  const { payloadCanonicalJson, proposalHash } =
    createHandoffProposalFingerprint({
      fromAgentName: params.fromAgentName,
      toAgentName: params.toAgentName,
      handoffPayload: params.handoffPayload,
    });

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
