import type { RunContext } from "./run-context";

export type PolicyDecision = "allow" | "deny";
export type PolicyDenyMode = "throw" | "tool_result";

export interface PolicyResult {
  decision: PolicyDecision;
  reason: string;
  publicReason?: string;
  denyMode?: PolicyDenyMode;
  policyVersion?: string;
  metadata?: Record<string, unknown>;
}

export interface PolicyResultOptions {
  publicReason?: string;
  denyMode?: PolicyDenyMode;
  policyVersion?: string;
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
    denyMode: options?.denyMode,
    policyVersion: options?.policyVersion,
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

export interface ToolPolicyInput<TContext = unknown> {
  agentName: string;
  toolName: string;
  rawArguments: string;
  parsedArguments: unknown;
  runContext: RunContext<TContext>;
  turn: number;
}

export interface HandoffPolicyInput<TContext = unknown> {
  fromAgentName: string;
  toAgentName: string;
  handoffPayload: unknown;
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
