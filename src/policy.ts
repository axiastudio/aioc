import type { RunContext } from "./run-context";

export type PolicyDecision = "allow" | "deny" | "require_approval";
export type PolicyResultMode = "throw" | "tool_result";

export interface PolicyResult {
  decision: PolicyDecision;
  reason: string;
  publicReason?: string;
  resultMode?: PolicyResultMode;
  policyVersion?: string;
  expiresAt?: string;
  metadata?: Record<string, unknown>;
}

export interface PolicyResultOptions {
  publicReason?: string;
  resultMode?: PolicyResultMode;
  policyVersion?: string;
  expiresAt?: string;
  metadata?: Record<string, unknown>;
}

function createPolicyResult(
  decision: PolicyDecision,
  reason: string,
  options?: PolicyResultOptions,
): PolicyResult {
  return {
    decision,
    reason,
    publicReason: options?.publicReason,
    resultMode: options?.resultMode,
    policyVersion: options?.policyVersion,
    expiresAt: options?.expiresAt,
    metadata: options?.metadata,
  };
}

export function allow(
  reason: string,
  options?: PolicyResultOptions,
): PolicyResult {
  return createPolicyResult("allow", reason, options);
}

export function deny(
  reason: string,
  options?: PolicyResultOptions,
): PolicyResult {
  return createPolicyResult("deny", reason, options);
}

export function requireApproval(
  reason: string,
  options?: PolicyResultOptions,
): PolicyResult {
  return createPolicyResult("require_approval", reason, options);
}

export interface ToolPolicyInput<TContext = unknown> {
  agentName: string;
  toolName: string;
  rawArguments: string;
  parsedArguments: unknown;
  proposalHash: string;
  argsCanonicalJson: string;
  runContext: RunContext<TContext>;
  turn: number;
}

export interface HandoffPolicyInput<TContext = unknown> {
  fromAgentName: string;
  toAgentName: string;
  handoffPayload: unknown;
  proposalHash: string;
  payloadCanonicalJson: string;
  runContext: RunContext<TContext>;
  turn: number;
}

export type ToolPolicy<TContext = unknown> = (
  input: ToolPolicyInput<TContext>,
) => Promise<PolicyResult> | PolicyResult;

export type HandoffPolicy<TContext = unknown> = (
  input: HandoffPolicyInput<TContext>,
) => Promise<PolicyResult> | PolicyResult;

export interface PolicyConfiguration<TContext = unknown> {
  toolPolicy?: ToolPolicy<TContext>;
  handoffPolicy?: HandoffPolicy<TContext>;
}
