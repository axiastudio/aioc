import assert from "node:assert/strict";
import {
  RunContext,
  allow,
  composeHandoffPolicies,
  composeToolPolicies,
  deny,
  type HandoffPolicyInput,
  type ToolPolicyInput,
} from "../../index";

type TestContext = {
  actorId: string;
};

function createRunContext(): RunContext<TestContext> {
  return new RunContext<TestContext>({
    actorId: "actor-1",
  });
}

function createToolInput(
  overrides: Partial<ToolPolicyInput<TestContext>> = {},
): ToolPolicyInput<TestContext> {
  return {
    agentName: "Support Agent",
    toolName: "search_docs",
    rawArguments: "{}",
    parsedArguments: {},
    proposalHash: "tool-proposal-hash",
    argsCanonicalJson: "{}",
    runContext: createRunContext(),
    turn: 1,
    ...overrides,
  };
}

function createHandoffInput(
  overrides: Partial<HandoffPolicyInput<TestContext>> = {},
): HandoffPolicyInput<TestContext> {
  return {
    fromAgentName: "Router Agent",
    toAgentName: "Support Agent",
    handoffPayload: { reason: "support" },
    proposalHash: "handoff-proposal-hash",
    payloadCanonicalJson: JSON.stringify({ reason: "support" }),
    runContext: createRunContext(),
    turn: 1,
    ...overrides,
  };
}

export async function runPolicyCompositionUnitTests(): Promise<void> {
  {
    const input = createToolInput();
    let observedInput: ToolPolicyInput<TestContext> | undefined;
    const policy = composeToolPolicies<TestContext>({
      search_docs: (candidate) => {
        observedInput = candidate;
        return allow("allow_search_docs");
      },
      "*": () => deny("deny_fallback"),
    });

    const result = await policy(input);

    assert.equal(observedInput, input);
    assert.equal(result.decision, "allow");
    assert.equal(result.reason, "allow_search_docs");
  }

  {
    const input = createToolInput({ toolName: "export_report" });
    let observedInput: ToolPolicyInput<TestContext> | undefined;
    const policy = composeToolPolicies<TestContext>({
      search_docs: () => allow("allow_search_docs"),
      "*": (candidate) => {
        observedInput = candidate;
        return deny(`deny_tool_${candidate.toolName}`);
      },
    });

    const result = await policy(input);

    assert.equal(observedInput, input);
    assert.equal(result.decision, "deny");
    assert.equal(result.reason, "deny_tool_export_report");
  }

  {
    const input = createToolInput({ toolName: "unconfigured_tool" });
    const policy = composeToolPolicies<TestContext>({
      search_docs: () => allow("allow_search_docs"),
    });

    const result = await policy(input);

    assert.equal(result.decision, "deny");
    assert.equal(result.reason, "deny_unconfigured_tool_unconfigured_tool");
  }

  {
    const input = createHandoffInput();
    let observedInput: HandoffPolicyInput<TestContext> | undefined;
    const policy = composeHandoffPolicies<TestContext>({
      "Support Agent": (candidate) => {
        observedInput = candidate;
        return allow("allow_support_handoff");
      },
      "*": () => deny("deny_fallback"),
    });

    const result = await policy(input);

    assert.equal(observedInput, input);
    assert.equal(result.decision, "allow");
    assert.equal(result.reason, "allow_support_handoff");
  }

  {
    const input = createHandoffInput({ toAgentName: "Finance Agent" });
    let observedInput: HandoffPolicyInput<TestContext> | undefined;
    const policy = composeHandoffPolicies<TestContext>({
      "Support Agent": () => allow("allow_support_handoff"),
      "*": (candidate) => {
        observedInput = candidate;
        return deny(`deny_handoff_${candidate.toAgentName}`);
      },
    });

    const result = await policy(input);

    assert.equal(observedInput, input);
    assert.equal(result.decision, "deny");
    assert.equal(result.reason, "deny_handoff_Finance Agent");
  }

  {
    const input = createHandoffInput({ toAgentName: "Finance Agent" });
    const policy = composeHandoffPolicies<TestContext>({
      "Support Agent": () => allow("allow_support_handoff"),
    });

    const result = await policy(input);

    assert.equal(result.decision, "deny");
    assert.equal(result.reason, "deny_unconfigured_handoff_Finance Agent");
  }
}
