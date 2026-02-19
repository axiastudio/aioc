import assert from "node:assert/strict";
import { z } from "zod";
import {
  Agent,
  ToolCallPolicyDeniedError,
  allow,
  deny,
  type ToolPolicy,
  run,
  setDefaultProvider,
  tool,
} from "../../index";
import { ScriptedProvider } from "../support/scripted-provider";

function createToolAgent(onExecute: () => void): Agent {
  const ping = tool({
    name: "ping",
    description: "Ping tool for policy tests",
    parameters: z.object({}),
    execute: () => {
      onExecute();
      return { ok: true };
    },
  });

  return new Agent({
    name: "Policy unit agent",
    model: "fake-model",
    tools: [ping],
  });
}

function createToolProposalTurns() {
  return [
    [
      {
        type: "tool_call" as const,
        callId: "call-1",
        name: "ping",
        arguments: "{}",
      },
    ],
    [{ type: "completed" as const, message: "done" }],
  ];
}

export async function runPolicyUnitTests(): Promise<void> {
  {
    const allowResult = allow("allow_reason", {
      policyVersion: "v1",
      metadata: { scope: "tool" },
    });
    const denyResult = deny("deny_reason");

    assert.deepEqual(allowResult, {
      decision: "allow",
      reason: "allow_reason",
      policyVersion: "v1",
      metadata: { scope: "tool" },
    });
    assert.deepEqual(denyResult, {
      decision: "deny",
      reason: "deny_reason",
      policyVersion: undefined,
      metadata: undefined,
    });
  }

  {
    let executions = 0;
    const allowPolicy: ToolPolicy = () => allow("allow_ping");

    setDefaultProvider(new ScriptedProvider(createToolProposalTurns()));
    const result = await run(
      createToolAgent(() => (executions += 1)),
      "hello",
      {
        policies: { toolPolicy: allowPolicy },
      },
    );

    assert.equal(result.finalOutput, "done");
    assert.equal(executions, 1);
  }

  {
    let executions = 0;
    setDefaultProvider(new ScriptedProvider(createToolProposalTurns()));
    await assert.rejects(
      () =>
        run(
          createToolAgent(() => (executions += 1)),
          "hello",
        ),
      (error: unknown) => {
        assert.ok(error instanceof ToolCallPolicyDeniedError);
        assert.equal(error.result.policyResult.reason, "policy_not_configured");
        return true;
      },
    );
    assert.equal(executions, 0);
  }

  {
    let executions = 0;
    const denyPolicy: ToolPolicy = () => deny("tool_not_allowlisted");

    setDefaultProvider(new ScriptedProvider(createToolProposalTurns()));
    await assert.rejects(
      () =>
        run(
          createToolAgent(() => (executions += 1)),
          "hello",
          {
            policies: { toolPolicy: denyPolicy },
          },
        ),
      (error: unknown) => {
        assert.ok(error instanceof ToolCallPolicyDeniedError);
        assert.equal(error.result.policyResult.reason, "tool_not_allowlisted");
        return true;
      },
    );
    assert.equal(executions, 0);
  }

  {
    let executions = 0;
    const explodingPolicy: ToolPolicy = () => {
      throw new Error("boom");
    };

    setDefaultProvider(new ScriptedProvider(createToolProposalTurns()));
    await assert.rejects(
      () =>
        run(
          createToolAgent(() => (executions += 1)),
          "hello",
          {
            policies: { toolPolicy: explodingPolicy },
          },
        ),
      (error: unknown) => {
        assert.ok(error instanceof ToolCallPolicyDeniedError);
        assert.equal(error.result.policyResult.reason, "policy_error");
        assert.equal(error.result.policyResult.metadata?.errorName, "Error");
        return true;
      },
    );
    assert.equal(executions, 0);
  }

  {
    let executions = 0;
    const invalidPolicy = (() => ({
      decision: "allow",
    })) as unknown as ToolPolicy;

    setDefaultProvider(new ScriptedProvider(createToolProposalTurns()));
    await assert.rejects(
      () =>
        run(
          createToolAgent(() => (executions += 1)),
          "hello",
          {
            policies: { toolPolicy: invalidPolicy },
          },
        ),
      (error: unknown) => {
        assert.ok(error instanceof ToolCallPolicyDeniedError);
        assert.equal(error.result.policyResult.reason, "invalid_policy_result");
        return true;
      },
    );
    assert.equal(executions, 0);
  }
}
