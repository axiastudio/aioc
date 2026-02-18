import assert from "node:assert/strict";
import { z } from "zod";
import { Agent, run, setDefaultProvider, tool } from "../../index";
import { toHandoffToolName } from "../support/handoff-name";
import { ScriptedProvider } from "../support/scripted-provider";

export async function runHandoffUnitTests(): Promise<void> {
  {
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
            arguments: JSON.stringify({ reason: "route" }),
          },
        ],
        [{ type: "completed", message: "Handled by target." }],
      ]),
    );

    const result = await run(sourceAgent, "hello");
    assert.equal(result.finalOutput, "Handled by target.");
    assert.equal(result.lastAgent.name, "Target Agent");
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

    const result = await run(sourceAgent, "hello");
    assert.equal(result.finalOutput, "Handled by target with suffix.");
    assert.equal(result.lastAgent.name, "Target Agent");
  }
}
