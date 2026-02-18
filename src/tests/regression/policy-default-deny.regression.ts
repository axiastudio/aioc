import assert from "node:assert/strict";
import { z } from "zod";
import {
  Agent,
  ToolCallPolicyDeniedError,
  type RunLogEvent,
  type RunLogger,
  run,
  setDefaultProvider,
  tool,
} from "../../index";
import { ScriptedProvider } from "../support/scripted-provider";

export async function runPolicyDefaultDenyRegressionTests(): Promise<void> {
  let executions = 0;
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
    name: "Policy regression agent",
    model: "fake-model",
    tools: [ping],
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
    ]),
  );

  const events: RunLogEvent[] = [];
  const logger: RunLogger = {
    log(event) {
      events.push(event);
    },
  };

  await assert.rejects(
    () =>
      run(agent, "hello", {
        logger,
      }),
    (error: unknown) => {
      assert.ok(error instanceof ToolCallPolicyDeniedError);
      assert.equal(error.result.policyResult.reason, "policy_not_configured");
      return true;
    },
  );
  assert.equal(executions, 0);

  const eventTypes = events.map((event) => event.type);
  assert.deepEqual(eventTypes, [
    "run_started",
    "agent_activated",
    "turn_started",
    "tool_call_started",
    "tool_policy_evaluated",
    "tool_call_failed",
    "run_failed",
  ]);

  const policyEvent = events.find(
    (event): event is Extract<RunLogEvent, { type: "tool_policy_evaluated" }> =>
      event.type === "tool_policy_evaluated",
  );
  assert.ok(policyEvent);
  assert.equal(policyEvent.toolName, "ping");
  assert.equal(policyEvent.callId, "call-1");
  assert.equal(policyEvent.decision, "deny");
  assert.equal(policyEvent.reason, "policy_not_configured");

  setDefaultProvider(
    new ScriptedProvider([
      [
        {
          type: "tool_call",
          callId: "call-2",
          name: "ping",
          arguments: "{}",
        },
      ],
      [{ type: "completed", message: "done" }],
    ]),
  );

  const allowEvents: RunLogEvent[] = [];
  const allowLogger: RunLogger = {
    log(event) {
      allowEvents.push(event);
    },
  };

  const allowResult = await run(agent, "hello", {
    logger: allowLogger,
    policies: {
      toolPolicy: () => ({
        decision: "allow",
        reason: "allow_ping",
        policyVersion: "v1",
        metadata: {
          gate: "strict",
        },
      }),
    },
  });

  assert.equal(allowResult.finalOutput, "done");
  assert.equal(executions, 1);

  const allowPolicyEvent = allowEvents.find(
    (event): event is Extract<RunLogEvent, { type: "tool_policy_evaluated" }> =>
      event.type === "tool_policy_evaluated",
  );
  assert.ok(allowPolicyEvent);
  assert.equal(allowPolicyEvent.callId, "call-2");
  assert.equal(allowPolicyEvent.decision, "allow");
  assert.equal(allowPolicyEvent.reason, "allow_ping");
  assert.equal(allowPolicyEvent.policyVersion, "v1");
  assert.equal(allowPolicyEvent.metadata?.gate, "strict");
}
