import assert from "node:assert/strict";
import { z } from "zod";
import {
  Agent,
  OutputGuardrailTripwireTriggered,
  ToolCallPolicyDeniedError,
  defineOutputGuardrail,
  deny,
  requireApproval,
  run,
  setDefaultProvider,
  tool,
  type RunRecord,
} from "../../index";
import { toHandoffToolName } from "../support/handoff-name";
import { ScriptedProvider } from "../support/scripted-provider";

export async function runRunRecordUnitTests(): Promise<void> {
  {
    const records: RunRecord<{ requestId: string; secret: string }>[] = [];

    setDefaultProvider(
      new ScriptedProvider([
        [
          { type: "delta", delta: "Hi " },
          { type: "delta", delta: "there." },
          { type: "completed", message: "Hi there." },
        ],
      ]),
    );

    const agent = new Agent<{ requestId: string; secret: string }>({
      name: "Run record completed",
      model: "fake-model",
      promptVersion: "run-record-completed.v1",
      instructions: "Always keep answers concise.",
    });

    const result = await run(agent, "hello", {
      stream: false,
      context: {
        requestId: "req-1",
        secret: "top-secret",
      },
      record: {
        includePromptText: true,
        contextRedactor: (context) => ({
          contextSnapshot: {
            requestId: context.requestId,
            secret: "[REDACTED]",
          },
          contextRedacted: true,
        }),
        sink: (record: RunRecord<{ requestId: string; secret: string }>) => {
          records.push(record);
        },
      },
    });

    assert.equal(result.finalOutput, "Hi there.");
    assert.equal(records.length, 1);
    assert.equal(records[0]?.status, "completed");
    assert.equal(records[0]?.question, "hello");
    assert.equal(records[0]?.response, "Hi there.");
    assert.equal(records[0]?.contextRedacted, true);
    assert.equal(records[0]?.contextSnapshot.secret, "[REDACTED]");
    assert.equal(records[0]?.promptSnapshots.length, 1);
    assert.equal(records[0]?.promptSnapshots[0]?.turn, 1);
    assert.equal(records[0]?.promptSnapshots[0]?.agentName, agent.name);
    assert.equal(records[0]?.promptSnapshots[0]?.model, "fake-model");
    assert.equal(
      records[0]?.promptSnapshots[0]?.promptVersion,
      "run-record-completed.v1",
    );
    assert.equal(
      records[0]?.promptSnapshots[0]?.promptText,
      "Always keep answers concise.",
    );
    assert.match(
      records[0]?.promptSnapshots[0]?.promptHash ?? "",
      /^[a-f0-9]{64}$/,
    );
    assert.equal(records[0]?.requestFingerprints.length, 1);
    assert.equal(records[0]?.requestFingerprints[0]?.turn, 1);
    assert.equal(
      records[0]?.requestFingerprints[0]?.agentName,
      "Run record completed",
    );
    assert.equal(
      records[0]?.requestFingerprints[0]?.providerName,
      "ScriptedProvider",
    );
    assert.equal(records[0]?.requestFingerprints[0]?.model, "fake-model");
    assert.ok(
      (records[0]?.requestFingerprints[0]?.runtimeVersion ?? "").length > 0,
    );
    assert.equal(
      records[0]?.requestFingerprints[0]?.fingerprintSchemaVersion,
      "request-fingerprint.v1",
    );
    assert.match(
      records[0]?.requestFingerprints[0]?.requestHash ?? "",
      /^[a-f0-9]{64}$/,
    );
    assert.match(
      records[0]?.requestFingerprints[0]?.systemPromptHash ?? "",
      /^[a-f0-9]{64}$/,
    );
    assert.match(
      records[0]?.requestFingerprints[0]?.messagesHash ?? "",
      /^[a-f0-9]{64}$/,
    );
    assert.match(
      records[0]?.requestFingerprints[0]?.toolsHash ?? "",
      /^[a-f0-9]{64}$/,
    );
    assert.match(
      records[0]?.requestFingerprints[0]?.modelSettingsHash ?? "",
      /^[a-f0-9]{64}$/,
    );
  }

  {
    const records: RunRecord[] = [];

    setDefaultProvider(
      new ScriptedProvider([
        [
          {
            type: "tool_call",
            callId: "call-1",
            name: "ping",
            arguments: "{}",
          },
        ],
      ]),
    );

    const ping = tool({
      name: "ping",
      description: "Ping tool",
      parameters: z.object({}),
      execute: () => ({ ok: true }),
    });

    const agent = new Agent({
      name: "Run record failed",
      model: "fake-model",
      instructions: "Try calling ping when available.",
      tools: [ping],
    });

    await assert.rejects(
      () =>
        run(agent, "hello", {
          record: {
            sink: (record) => {
              records.push(record);
            },
          },
        }),
      (error: unknown) => {
        assert.ok(error instanceof ToolCallPolicyDeniedError);
        return true;
      },
    );

    assert.equal(records.length, 1);
    assert.equal(records[0]?.status, "failed");
    assert.equal(records[0]?.errorName, "ToolCallPolicyDeniedError");
    assert.equal(records[0]?.policyDecisions.length, 1);
    assert.equal(records[0]?.policyDecisions[0]?.decision, "deny");
    assert.equal(
      records[0]?.policyDecisions[0]?.reason,
      "policy_not_configured",
    );
    assert.equal(records[0]?.policyDecisions[0]?.resultMode, "throw");
    assert.equal(records[0]?.policyDecisions[0]?.resource.kind, "tool");
    assert.equal(records[0]?.policyDecisions[0]?.resource.name, "ping");
    assert.equal(records[0]?.promptSnapshots.length, 1);
    assert.equal(records[0]?.promptSnapshots[0]?.promptText, undefined);
    assert.match(
      records[0]?.promptSnapshots[0]?.promptHash ?? "",
      /^[a-f0-9]{64}$/,
    );
    assert.equal(records[0]?.requestFingerprints.length, 1);
    assert.equal(records[0]?.requestFingerprints[0]?.turn, 1);
    assert.equal(records[0]?.requestFingerprints[0]?.toolCount, 1);
  }

  {
    const records: RunRecord[] = [];

    let executions = 0;

    setDefaultProvider(
      new ScriptedProvider([
        [
          {
            type: "tool_call",
            callId: "call-approval-1",
            name: "ping",
            arguments: "{}",
          },
        ],
        [{ type: "completed", message: "done" }],
      ]),
    );

    const ping = tool({
      name: "ping",
      description: "Ping tool",
      parameters: z.object({}),
      execute: () => {
        executions += 1;
        return { ok: true };
      },
    });

    const agent = new Agent({
      name: "Run record approval required",
      model: "fake-model",
      instructions: "Try calling ping when available.",
      tools: [ping],
    });

    const result = await run(agent, "hello", {
      policies: {
        toolPolicy: () =>
          requireApproval("manager_approval_required", {
            publicReason: "Manager approval is required.",
            resultMode: "tool_result",
            policyVersion: "approval-policy.v1",
            expiresAt: "2026-04-01T00:00:00Z",
          }),
      },
      record: {
        sink: (record) => {
          records.push(record);
        },
      },
    });

    assert.equal(result.finalOutput, "done");
    assert.equal(executions, 0);
    assert.equal(records.length, 1);
    assert.equal(records[0]?.policyDecisions.length, 1);
    assert.equal(records[0]?.policyDecisions[0]?.decision, "require_approval");
    assert.equal(
      records[0]?.policyDecisions[0]?.reason,
      "manager_approval_required",
    );
    assert.equal(
      records[0]?.policyDecisions[0]?.publicReason,
      "Manager approval is required.",
    );
    assert.equal(records[0]?.policyDecisions[0]?.resultMode, "tool_result");
    assert.equal(
      records[0]?.policyDecisions[0]?.policyVersion,
      "approval-policy.v1",
    );
    assert.equal(
      records[0]?.policyDecisions[0]?.expiresAt,
      "2026-04-01T00:00:00Z",
    );
    const outputItem = records[0]?.items.find(
      (
        item,
      ): item is Extract<
        RunRecord["items"][number],
        { type: "tool_call_output_item" }
      > => item.type === "tool_call_output_item",
    );
    assert.deepEqual(outputItem?.output, {
      status: "approval_required",
      code: "manager_approval_required",
      publicReason: "Manager approval is required.",
      data: null,
    });
  }

  {
    const records: RunRecord[] = [];

    setDefaultProvider(
      new ScriptedProvider([
        [{ type: "completed", message: "Streamed completion." }],
      ]),
    );

    const agent = new Agent({
      name: "Run record stream",
      model: "fake-model",
      instructions: "Stream a short answer.",
    });

    const streamed = await run(agent, "hello stream", {
      stream: true,
      record: {
        sink: (record) => {
          records.push(record);
        },
      },
    });

    for await (const _event of streamed.toStream()) {
      void _event;
    }

    assert.equal(records.length, 1);
    assert.equal(records[0]?.status, "completed");
    assert.equal(records[0]?.response, "Streamed completion.");
    assert.equal(records[0]?.promptSnapshots.length, 1);
    assert.equal(records[0]?.promptSnapshots[0]?.turn, 1);
    assert.equal(records[0]?.requestFingerprints.length, 1);
    assert.equal(records[0]?.requestFingerprints[0]?.turn, 1);
    assert.equal(records[0]?.requestFingerprints[0]?.messageCount, 1);
  }

  {
    const records: RunRecord[] = [];

    const targetAgent = new Agent({
      name: "Run record handoff target",
      model: "fake-model",
    });
    const sourceAgent = new Agent({
      name: "Run record handoff source",
      model: "fake-model",
      handoffs: [targetAgent],
    });
    const handoffToolName = toHandoffToolName(targetAgent.name);

    setDefaultProvider(
      new ScriptedProvider([
        [
          {
            type: "tool_call",
            callId: "handoff-call-1",
            name: handoffToolName,
            arguments: JSON.stringify({ reason: "route" }),
          },
        ],
        [{ type: "completed", message: "Stayed on source." }],
      ]),
    );

    const result = await run(sourceAgent, "handoff request", {
      policies: {
        handoffPolicy: () =>
          deny("target_not_allowlisted", {
            publicReason: "Escalation not permitted.",
            denyMode: "tool_result",
            policyVersion: "handoff-policy.v1",
          }),
      },
      record: {
        sink: (record) => {
          records.push(record);
        },
      },
    });

    assert.equal(result.finalOutput, "Stayed on source.");
    assert.equal(result.lastAgent.name, sourceAgent.name);
    assert.equal(records.length, 1);
    assert.equal(records[0]?.status, "completed");
    assert.equal(records[0]?.policyDecisions.length, 1);
    assert.equal(records[0]?.policyDecisions[0]?.resource.kind, "handoff");
    assert.equal(
      records[0]?.policyDecisions[0]?.resource.name,
      targetAgent.name,
    );
    assert.equal(records[0]?.policyDecisions[0]?.decision, "deny");
    assert.equal(
      records[0]?.policyDecisions[0]?.reason,
      "target_not_allowlisted",
    );
    assert.equal(
      records[0]?.policyDecisions[0]?.publicReason,
      "Escalation not permitted.",
    );
    assert.equal(records[0]?.policyDecisions[0]?.resultMode, "tool_result");
    assert.equal(
      records[0]?.policyDecisions[0]?.policyVersion,
      "handoff-policy.v1",
    );
    const outputItem = records[0]?.items.find(
      (
        item,
      ): item is Extract<
        RunRecord["items"][number],
        { type: "tool_call_output_item" }
      > => item.type === "tool_call_output_item",
    );
    assert.deepEqual(outputItem?.output, {
      status: "denied",
      code: "target_not_allowlisted",
      publicReason: "Escalation not permitted.",
      data: null,
    });
    assert.equal(records[0]?.promptSnapshots.length, 2);
    assert.equal(records[0]?.requestFingerprints.length, 2);
    assert.notEqual(
      records[0]?.requestFingerprints[0]?.requestHash,
      records[0]?.requestFingerprints[1]?.requestHash,
    );
  }

  {
    const records: RunRecord[] = [];
    const tripwire = defineOutputGuardrail({
      name: "block_unsafe_output",
      execute: ({ outputText }) => ({
        tripwireTriggered: outputText.toLowerCase().includes("unsafe"),
        reason: "contains unsafe token",
      }),
    });

    setDefaultProvider(
      new ScriptedProvider([[{ type: "completed", message: "unsafe output" }]]),
    );

    const agent = new Agent({
      name: "Run record guardrail fail",
      model: "fake-model",
      outputGuardrails: [tripwire],
    });

    await assert.rejects(
      () =>
        run(agent, "hello", {
          record: {
            sink: (record) => {
              records.push(record);
            },
          },
        }),
      (error: unknown) => {
        assert.ok(error instanceof OutputGuardrailTripwireTriggered);
        return true;
      },
    );

    assert.equal(records.length, 1);
    assert.equal(records[0]?.status, "failed");
    assert.equal(records[0]?.errorName, "OutputGuardrailTripwireTriggered");
    assert.equal(records[0]?.guardrailDecisions?.length, 1);
    assert.equal(
      records[0]?.guardrailDecisions?.[0]?.guardrailName,
      tripwire.name,
    );
    assert.equal(records[0]?.guardrailDecisions?.[0]?.decision, "triggered");
    assert.equal(
      records[0]?.guardrailDecisions?.[0]?.reason,
      "contains unsafe token",
    );
    assert.equal(records[0]?.promptSnapshots.length, 1);
    assert.equal(records[0]?.requestFingerprints.length, 1);
  }

  {
    const records: RunRecord<{ requestId: string; secret: string }>[] = [];

    setDefaultProvider(
      new ScriptedProvider([[{ type: "completed", message: "ok" }]]),
    );

    const agent = new Agent<{ requestId: string; secret: string }>({
      name: "Run record redactor fallback",
      model: "fake-model",
    });

    const result = await run(agent, "hello", {
      context: { requestId: "req-2", secret: "raw-secret" },
      record: {
        contextRedactor: () => {
          throw new Error("redactor failure");
        },
        sink: (record) => {
          records.push(record);
        },
      },
    });

    assert.equal(result.finalOutput, "ok");
    assert.equal(records.length, 1);
    assert.equal(records[0]?.contextRedacted, false);
    assert.equal(records[0]?.contextSnapshot.secret, "raw-secret");
  }

  {
    let sinkCalls = 0;

    setDefaultProvider(
      new ScriptedProvider([[{ type: "completed", message: "sink ignored" }]]),
    );

    const agent = new Agent({
      name: "Run record sink failure",
      model: "fake-model",
    });

    const result = await run(agent, "hello", {
      record: {
        sink: () => {
          sinkCalls += 1;
          throw new Error("sink unavailable");
        },
      },
    });

    assert.equal(result.finalOutput, "sink ignored");
    assert.equal(sinkCalls, 1);
  }
}
