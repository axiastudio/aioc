import assert from "node:assert/strict";
import { z } from "zod";
import {
  Agent,
  ToolCallApprovalRequiredError,
  ToolCallPolicyDeniedError,
  allow,
  deny,
  requireApproval,
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

function createParameterlessToolAgent(onExecute: () => void): Agent {
  const ping = tool({
    name: "ping",
    description: "Ping tool without explicit parameters",
    execute: () => {
      onExecute();
      return { ok: true };
    },
  });

  return new Agent({
    name: "Parameterless policy unit agent",
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
    const denyAsToolResult = deny("deny_reason_public", {
      publicReason: "Not allowed for this user.",
      resultMode: "tool_result",
    });
    const denyResult = deny("deny_reason");

    assert.deepEqual(allowResult, {
      decision: "allow",
      reason: "allow_reason",
      publicReason: undefined,
      resultMode: undefined,
      policyVersion: "v1",
      expiresAt: undefined,
      metadata: { scope: "tool" },
    });
    assert.deepEqual(denyResult, {
      decision: "deny",
      reason: "deny_reason",
      publicReason: undefined,
      resultMode: undefined,
      policyVersion: undefined,
      expiresAt: undefined,
      metadata: undefined,
    });
    assert.deepEqual(denyAsToolResult, {
      decision: "deny",
      reason: "deny_reason_public",
      publicReason: "Not allowed for this user.",
      resultMode: "tool_result",
      policyVersion: undefined,
      expiresAt: undefined,
      metadata: undefined,
    });

    const approvalRequiredResult = requireApproval(
      "manager_approval_required",
      {
        publicReason: "Manager approval is required.",
        resultMode: "tool_result",
        expiresAt: "2026-04-01T00:00:00Z",
      },
    );
    assert.deepEqual(approvalRequiredResult, {
      decision: "require_approval",
      reason: "manager_approval_required",
      publicReason: "Manager approval is required.",
      resultMode: "tool_result",
      policyVersion: undefined,
      expiresAt: "2026-04-01T00:00:00Z",
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
      data: { ok: true },
    });
  }

  {
    let executions = 0;
    const allowPolicy: ToolPolicy = () => allow("allow_ping");

    setDefaultProvider(new ScriptedProvider(createToolProposalTurns()));
    const result = await run(
      createParameterlessToolAgent(() => (executions += 1)),
      "hello",
      {
        policies: { toolPolicy: allowPolicy },
      },
    );

    assert.equal(result.finalOutput, "done");
    assert.equal(executions, 1);
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
      data: { ok: true },
    });
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
    const softDenyPolicy: ToolPolicy = () =>
      deny("tool_not_allowlisted", {
        publicReason: "You are not allowed to access this tool.",
        resultMode: "tool_result",
      });

    setDefaultProvider(new ScriptedProvider(createToolProposalTurns()));
    const result = await run(
      createToolAgent(() => (executions += 1)),
      "hello",
      {
        policies: { toolPolicy: softDenyPolicy },
      },
    );

    assert.equal(result.finalOutput, "done");
    assert.equal(executions, 0);
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
      code: "tool_not_allowlisted",
      publicReason: "You are not allowed to access this tool.",
      data: null,
    });
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
    const approvalPolicy: ToolPolicy = () =>
      requireApproval("manager_approval_required", {
        publicReason: "Manager approval is required.",
      });

    setDefaultProvider(new ScriptedProvider(createToolProposalTurns()));
    await assert.rejects(
      () =>
        run(
          createToolAgent(() => (executions += 1)),
          "hello",
          {
            policies: { toolPolicy: approvalPolicy },
          },
        ),
      (error: unknown) => {
        assert.ok(error instanceof ToolCallApprovalRequiredError);
        assert.equal(
          error.result.policyResult.reason,
          "manager_approval_required",
        );
        assert.equal(error.result.policyResult.resultMode, "throw");
        return true;
      },
    );
    assert.equal(executions, 0);
  }

  {
    let executions = 0;
    const softApprovalPolicy: ToolPolicy = () =>
      requireApproval("manager_approval_required", {
        publicReason: "Manager approval is required.",
        resultMode: "tool_result",
        expiresAt: "2026-04-01T00:00:00Z",
      });

    setDefaultProvider(new ScriptedProvider(createToolProposalTurns()));
    const result = await run(
      createToolAgent(() => (executions += 1)),
      "hello",
      {
        policies: { toolPolicy: softApprovalPolicy },
      },
    );

    assert.equal(result.finalOutput, "done");
    assert.equal(executions, 0);
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

  {
    let executions = 0;
    const legacyDenyModePolicy = (() => ({
      decision: "deny" as const,
      reason: "tool_not_allowlisted",
      denyMode: "tool_result",
    })) as unknown as ToolPolicy;

    setDefaultProvider(new ScriptedProvider(createToolProposalTurns()));
    await assert.rejects(
      () =>
        run(
          createToolAgent(() => (executions += 1)),
          "hello",
          {
            policies: { toolPolicy: legacyDenyModePolicy },
          },
        ),
      (error: unknown) => {
        assert.ok(error instanceof ToolCallPolicyDeniedError);
        assert.equal(
          error.result.policyResult.reason,
          "deprecated_policy_field_denyMode",
        );
        assert.equal(
          error.result.policyResult.metadata?.replacementField,
          "resultMode",
        );
        return true;
      },
    );
    assert.equal(executions, 0);
  }
}
