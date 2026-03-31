import assert from "node:assert/strict";
import { z } from "zod";
import {
  Agent,
  HandoffApprovalRequiredError,
  HandoffPolicyDeniedError,
  deny,
  requireApproval,
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
    const toolOutputItem = result.history.find(
      (
        item,
      ): item is Extract<
        (typeof result.history)[number],
        { type: "tool_call_output_item" }
      > => item.type === "tool_call_output_item",
    );
    assert.deepEqual(toolOutputItem?.output, {
      status: "ok",
      code: null,
      publicReason: null,
      data: {
        handoffTo: "Target Agent",
        accepted: true,
        payload: { reason: "route" },
      },
    });
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
        resultMode: "tool_result",
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
    const approvalHandoffPolicy: HandoffPolicy = () =>
      requireApproval("manager_approval_required", {
        publicReason: "Manager approval is required.",
      });

    setDefaultProvider(
      new ScriptedProvider(createHandoffTurns(handoffToolName)),
    );
    await assert.rejects(
      () =>
        run(sourceAgent, "hello", {
          policies: {
            handoffPolicy: approvalHandoffPolicy,
          },
        }),
      (error: unknown) => {
        assert.ok(error instanceof HandoffApprovalRequiredError);
        assert.equal(
          error.result.policyResult.reason,
          "manager_approval_required",
        );
        assert.equal(error.result.policyResult.resultMode, "throw");
        const suspendedProposal = error.result.suspendedProposal;
        assert.equal(suspendedProposal.kind, "handoff");
        if (suspendedProposal.kind !== "handoff") {
          return false;
        }
        assert.equal(suspendedProposal.agentName, "Source Agent");
        assert.equal(suspendedProposal.turn, 1);
        assert.equal(suspendedProposal.callId, "handoff-call-1");
        assert.equal(suspendedProposal.fromAgentName, "Source Agent");
        assert.equal(suspendedProposal.toAgentName, "Target Agent");
        assert.deepEqual(suspendedProposal.handoffPayload, {
          reason: "route",
        });
        assert.equal(
          suspendedProposal.payloadCanonicalJson,
          JSON.stringify({ reason: "route" }),
        );
        assert.match(suspendedProposal.proposalHash, /^[a-f0-9]{64}$/);
        assert.ok(suspendedProposal.runId.length > 0);
        return true;
      },
    );
  }

  {
    const { sourceAgent, handoffToolName } = createAgents();
    const softApprovalHandoffPolicy: HandoffPolicy = () =>
      requireApproval("manager_approval_required", {
        publicReason: "Manager approval is required.",
        resultMode: "tool_result",
      });

    setDefaultProvider(
      new ScriptedProvider(createHandoffTurns(handoffToolName)),
    );
    const result = await run(sourceAgent, "hello", {
      policies: {
        handoffPolicy: softApprovalHandoffPolicy,
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
      status: "approval_required",
      code: "manager_approval_required",
      publicReason: "Manager approval is required.",
      data: null,
    });
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
