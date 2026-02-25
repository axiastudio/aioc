import assert from "node:assert/strict";
import { z } from "zod";
import {
  Agent,
  ToolCallPolicyDeniedError,
  run,
  setDefaultProvider,
  tool,
  type RunRecord,
} from "../../index";
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
    assert.equal(records[0]?.policyDecisions[0]?.resource.kind, "tool");
    assert.equal(records[0]?.policyDecisions[0]?.resource.name, "ping");
    assert.equal(records[0]?.promptSnapshots.length, 1);
    assert.equal(records[0]?.promptSnapshots[0]?.promptText, undefined);
    assert.match(
      records[0]?.promptSnapshots[0]?.promptHash ?? "",
      /^[a-f0-9]{64}$/,
    );
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
  }
}
