import assert from "node:assert/strict";
import { z } from "zod";
import {
  Agent,
  deny,
  type RunLogEvent,
  type RunLogger,
  run,
  setDefaultProvider,
  tool,
  type RunRecord,
} from "../../index";
import { ScriptedProvider } from "../support/scripted-provider";

export async function runAuditTrailConsistencyRegressionTests(): Promise<void> {
  const ping = tool({
    name: "ping",
    description: "Ping tool",
    parameters: z.object({}),
    execute: () => ({ ok: true }),
  });

  const agent = new Agent({
    name: "Audit trail consistency agent",
    model: "fake-model",
    tools: [ping],
    instructions: "Use ping when available.",
  });

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
      [{ type: "completed", message: "done" }],
    ]),
  );

  const events: RunLogEvent[] = [];
  const logger: RunLogger = {
    log(event) {
      events.push(event);
    },
  };
  const records: RunRecord[] = [];

  const result = await run(agent, "hello", {
    logger,
    record: {
      sink: (record) => {
        records.push(record);
      },
    },
    policies: {
      toolPolicy: () =>
        deny("tool_not_allowlisted", {
          policyVersion: "policy.v1",
          publicReason: "Not allowed in this context.",
          denyMode: "tool_result",
        }),
    },
  });

  assert.equal(result.finalOutput, "done");
  assert.equal(records.length, 1);

  const loggerDecision = events.find(
    (event): event is Extract<RunLogEvent, { type: "tool_policy_evaluated" }> =>
      event.type === "tool_policy_evaluated",
  );
  assert.ok(loggerDecision);
  assert.equal(loggerDecision.decision, "deny");
  assert.equal(loggerDecision.reason, "tool_not_allowlisted");
  assert.equal(loggerDecision.policyVersion, "policy.v1");

  const recordDecision = records[0]?.policyDecisions[0];
  assert.ok(recordDecision);
  assert.equal(recordDecision?.decision, "deny");
  assert.equal(recordDecision?.reason, "tool_not_allowlisted");
  assert.equal(recordDecision?.policyVersion, "policy.v1");

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
    code: "tool_not_allowlisted",
    publicReason: "Not allowed in this context.",
    data: null,
  });
  assert.equal(records[0]?.promptSnapshots.length, 2);
  assert.equal(records[0]?.requestFingerprints.length, 2);
}
