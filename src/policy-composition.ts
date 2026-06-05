import { deny, type HandoffPolicy, type ToolPolicy } from "./policy";

export type ToolPolicyMap<TContext = unknown> = Record<
  string,
  ToolPolicy<TContext>
>;

export type HandoffPolicyMap<TContext = unknown> = Record<
  string,
  HandoffPolicy<TContext>
>;

export function composeToolPolicies<TContext = unknown>(
  policies: ToolPolicyMap<TContext>,
): ToolPolicy<TContext> {
  return (input) => {
    const policy = policies[input.toolName] ?? policies["*"];

    if (policy) {
      return policy(input);
    }

    return deny(`deny_unconfigured_tool_${input.toolName}`);
  };
}

export function composeHandoffPolicies<TContext = unknown>(
  policies: HandoffPolicyMap<TContext>,
): HandoffPolicy<TContext> {
  return (input) => {
    const policy = policies[input.toAgentName] ?? policies["*"];

    if (policy) {
      return policy(input);
    }

    return deny(`deny_unconfigured_handoff_${input.toAgentName}`);
  };
}
