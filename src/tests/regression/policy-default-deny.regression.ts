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
  const ping = tool({
    name: "ping",
    description: "Ping tool",
    parameters: z.object({}),
    execute: () => ({ ok: true }),
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

  const eventTypes = events.map((event) => event.type);
  assert.deepEqual(eventTypes, [
    "run_started",
    "agent_activated",
    "turn_started",
    "tool_call_started",
    "tool_call_failed",
    "run_failed",
  ]);
}
