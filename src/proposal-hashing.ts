import { hashCanonicalJson, toCanonicalJson } from "./canonical-json";

export interface ToolProposalFingerprintInput {
  agentName: string;
  toolName: string;
  parsedArguments: unknown;
}

export interface ToolProposalFingerprint {
  proposalHash: string;
  argsCanonicalJson: string;
}

export interface HandoffProposalFingerprintInput {
  fromAgentName: string;
  toAgentName: string;
  handoffPayload: unknown;
}

export interface HandoffProposalFingerprint {
  proposalHash: string;
  payloadCanonicalJson: string;
}

export function createToolProposalFingerprint(
  input: ToolProposalFingerprintInput,
): ToolProposalFingerprint {
  const argsCanonicalJson = toCanonicalJson(input.parsedArguments);
  const proposalHash = hashCanonicalJson(
    toCanonicalJson({
      kind: "tool",
      agentName: input.agentName,
      toolName: input.toolName,
      argsCanonicalJson,
    }),
  );

  return {
    proposalHash,
    argsCanonicalJson,
  };
}

export function createHandoffProposalFingerprint(
  input: HandoffProposalFingerprintInput,
): HandoffProposalFingerprint {
  const payloadCanonicalJson = toCanonicalJson(input.handoffPayload);
  const proposalHash = hashCanonicalJson(
    toCanonicalJson({
      kind: "handoff",
      fromAgentName: input.fromAgentName,
      toAgentName: input.toAgentName,
      payloadCanonicalJson,
    }),
  );

  return {
    proposalHash,
    payloadCanonicalJson,
  };
}
