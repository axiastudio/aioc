import assert from "node:assert/strict";
import { z } from "zod";
import {
  Agent,
  HandoffPolicyDeniedError,
  deny,
  type HandoffPolicy,
  run,
  setDefaultProvider,
  tool,
} from "../../index";
import { toHandoffToolName } from "../support/handoff-name";
import { ScriptedProvider } from "../support/scripted-provider";

function createAgents(): {
  sourceAgent: Agent;
  targetAgent: Agent;
  handoffToolName: string;
} {
  const targetAgent = new Agent({
    name: "Target Agent",
    model: "fake-model",
  });

  const sourceAgent = new Agent({
    name: "Source Agent",
    model: "fake-model",
    handoffs: [targetAgent],
  });

  return {
    sourceAgent,
    targetAgent,
    handoffToolName: toHandoffToolName(targetAgent.name),
  };
}

function createHandoffTurns(handoffToolName: string) {
  return [
    [
      {
        type: "tool_call" as const,
        callId: "handoff-call-1",
        name: handoffToolName,
        arguments: JSON.stringify({ reason: "route" }),
      },
    ],
    [{ type: "completed" as const, message: "Handled by target." }],
  ];
}

export async function runHandoffUnitTests(): Promise<void> {
  {
    const { sourceAgent, handoffToolName } = createAgents();
    const allowHandoffPolicy: HandoffPolicy = () => ({
      decision: "allow",
      reason: "allow_transition",
    });

    setDefaultProvider(
      new ScriptedProvider(createHandoffTurns(handoffToolName)),
    );
    const result = await run(sourceAgent, "hello", {
      policies: {
        handoffPolicy: allowHandoffPolicy,
      },
    });
    assert.equal(result.finalOutput, "Handled by target.");
    assert.equal(result.lastAgent.name, "Target Agent");
  }

  {
    const { sourceAgent, handoffToolName } = createAgents();
    setDefaultProvider(
      new ScriptedProvider(createHandoffTurns(handoffToolName)),
    );

    await assert.rejects(
      () => run(sourceAgent, "hello"),
      (error: unknown) => {
        assert.ok(error instanceof HandoffPolicyDeniedError);
        assert.equal(error.result.policyResult.reason, "policy_not_configured");
        return true;
      },
    );
  }

  {
    const { sourceAgent, handoffToolName } = createAgents();
    const denyHandoffPolicy: HandoffPolicy = () => ({
      decision: "deny",
      reason: "target_not_allowlisted",
    });

    setDefaultProvider(
      new ScriptedProvider(createHandoffTurns(handoffToolName)),
    );
    await assert.rejects(
      () =>
        run(sourceAgent, "hello", {
          policies: {
            handoffPolicy: denyHandoffPolicy,
          },
        }),
      (error: unknown) => {
        assert.ok(error instanceof HandoffPolicyDeniedError);
        assert.equal(
          error.result.policyResult.reason,
          "target_not_allowlisted",
        );
        return true;
      },
    );
  }

  {
    const { sourceAgent, handoffToolName } = createAgents();
    const softDenyHandoffPolicy: HandoffPolicy = () =>
      deny("target_not_allowlisted", {
        publicReason: "Escalation not permitted for this request.",
        denyMode: "tool_result",
      });

    setDefaultProvider(
      new ScriptedProvider(createHandoffTurns(handoffToolName)),
    );
    const result = await run(sourceAgent, "hello", {
      policies: {
        handoffPolicy: softDenyHandoffPolicy,
      },
    });

    assert.equal(result.finalOutput, "Handled by target.");
    assert.equal(result.lastAgent.name, "Source Agent");
    const toolOutputItem = result.history.find(
      (
        item,
      ): item is Extract<
        (typeof result.history)[number],
        { type: "tool_call_output_item" }
      > => item.type === "tool_call_output_item",
    );
    assert.deepEqual(toolOutputItem?.output, {
      status: "denied",
      code: "target_not_allowlisted",
      publicReason: "Escalation not permitted for this request.",
      data: null,
    });
  }

  {
    const { sourceAgent, handoffToolName } = createAgents();
    const failingHandoffPolicy: HandoffPolicy = () => {
      throw new Error("policy failed");
    };

    setDefaultProvider(
      new ScriptedProvider(createHandoffTurns(handoffToolName)),
    );
    await assert.rejects(
      () =>
        run(sourceAgent, "hello", {
          policies: {
            handoffPolicy: failingHandoffPolicy,
          },
        }),
      (error: unknown) => {
        assert.ok(error instanceof HandoffPolicyDeniedError);
        assert.equal(error.result.policyResult.reason, "policy_error");
        return true;
      },
    );
  }

  {
    const { sourceAgent, handoffToolName } = createAgents();
    const invalidHandoffPolicy = (() => ({
      decision: "allow",
    })) as unknown as HandoffPolicy;

    setDefaultProvider(
      new ScriptedProvider(createHandoffTurns(handoffToolName)),
    );
    await assert.rejects(
      () =>
        run(sourceAgent, "hello", {
          policies: {
            handoffPolicy: invalidHandoffPolicy,
          },
        }),
      (error: unknown) => {
        assert.ok(error instanceof HandoffPolicyDeniedError);
        assert.equal(error.result.policyResult.reason, "invalid_policy_result");
        return true;
      },
    );
  }

  {
    const targetAgent = new Agent({
      name: "Target Agent",
      model: "fake-model",
    });

    const collidingTool = tool({
      name: toHandoffToolName(targetAgent.name),
      description: "Colliding tool name",
      parameters: z.object({}),
      execute: () => ({ ok: true }),
    });

    const sourceAgent = new Agent({
      name: "Source Agent",
      model: "fake-model",
      tools: [collidingTool],
      handoffs: [targetAgent],
    });

    const reservedHandoffName = toHandoffToolName(targetAgent.name);
    const suffixedHandoffName = `${reservedHandoffName}_2`;

    setDefaultProvider(
      new ScriptedProvider([
        [
          {
            type: "tool_call",
            callId: "handoff-call-2",
            name: suffixedHandoffName,
            arguments: "{}",
          },
        ],
        [{ type: "completed", message: "Handled by target with suffix." }],
      ]),
    );

    const result = await run(sourceAgent, "hello", {
      policies: {
        handoffPolicy: () => ({
          decision: "allow",
          reason: "allow_transition",
        }),
      },
    });
    assert.equal(result.finalOutput, "Handled by target with suffix.");
    assert.equal(result.lastAgent.name, "Target Agent");
  }
}
