import assert from "node:assert/strict";
import {
  Agent,
  type RunLogEvent,
  type RunLogger,
  run,
  setDefaultProvider,
} from "../../index";
import { toHandoffToolName } from "../support/handoff-name";
import { ScriptedProvider } from "../support/scripted-provider";

export async function runHandoffTransitionRegressionTests(): Promise<void> {
  const targetAgent = new Agent({
    name: "Target Agent",
    model: "fake-model",
  });
  const sourceAgent = new Agent({
    name: "Source Agent",
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
          arguments: "{}",
        },
      ],
      [{ type: "completed", message: "Done from target." }],
    ]),
  );

  const events: RunLogEvent[] = [];
  const logger: RunLogger = {
    log(event) {
      events.push(event);
    },
  };

  const result = await run(sourceAgent, "hello", {
    logger,
    policies: {
      handoffPolicy: () => ({
        decision: "allow",
        reason: "allow_transition",
        policyVersion: "v1",
      }),
    },
  });
  assert.equal(result.finalOutput, "Done from target.");
  assert.equal(result.lastAgent.name, "Target Agent");

  const activatedAgents = events
    .filter(
      (event): event is Extract<RunLogEvent, { type: "agent_activated" }> =>
        event.type === "agent_activated",
    )
    .map((event) => event.agent);

  assert.deepEqual(activatedAgents, ["Source Agent", "Target Agent"]);

  const handoffPolicyEvent = events.find(
    (
      event,
    ): event is Extract<RunLogEvent, { type: "handoff_policy_evaluated" }> =>
      event.type === "handoff_policy_evaluated",
  );
  assert.ok(handoffPolicyEvent);
  assert.equal(handoffPolicyEvent.handoffName, handoffToolName);
  assert.equal(handoffPolicyEvent.callId, "handoff-call-1");
  assert.equal(handoffPolicyEvent.decision, "allow");
  assert.equal(handoffPolicyEvent.reason, "allow_transition");
  assert.equal(handoffPolicyEvent.policyVersion, "v1");
}
