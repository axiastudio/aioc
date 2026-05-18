import assert from "node:assert/strict";
import { z } from "zod";
import {
  Agent,
  allow,
  run,
  setDefaultProvider,
  toRunOutputEvents,
  tool,
  type HandoffPolicy,
  type ModelProvider,
  type ProviderEvent,
  type ProviderRequest,
  type ToolPolicy,
} from "../../index";
import { toHandoffToolName } from "../support/handoff-name";
import { ScriptedProvider } from "../support/scripted-provider";

function createLookupAgent(): Agent {
  const lookup = tool({
    name: "lookup",
    description: "Lookup test chunks",
    parameters: z.object({
      query: z.string(),
    }),
    execute: ({ query }) => ({
      chunks: [
        {
          number: 1,
          text: `Result for ${query}`,
        },
      ],
    }),
  });

  return new Agent({
    name: "Run output events agent",
    model: "fake-model",
    tools: [lookup],
  });
}

function createToolTurns(): ProviderEvent[][] {
  return [
    [
      {
        type: "delta",
        delta: "Searching. ",
      },
      {
        type: "tool_call",
        callId: "lookup-1",
        name: "lookup",
        arguments: JSON.stringify({ query: "aioc" }),
      },
    ],
    [
      {
        type: "delta",
        delta: "Final ",
      },
      {
        type: "delta",
        delta: "answer.",
      },
      {
        type: "completed",
        message: "Final answer.",
      },
    ],
  ];
}

class ThrowingProvider implements ModelProvider {
  async *stream<TContext = unknown>(
    _request: ProviderRequest<TContext>,
  ): AsyncIterable<ProviderEvent> {
    void _request;
    yield {
      type: "delta",
      delta: "partial",
    };
    throw new Error("provider boom");
  }
}

export async function runRunOutputEventsUnitTests(): Promise<void> {
  {
    const toolPolicy: ToolPolicy = () => allow("allow_lookup");
    setDefaultProvider(new ScriptedProvider(createToolTurns()));

    const streamed = await run(createLookupAgent(), "Find chunks.", {
      stream: true,
      policies: { toolPolicy },
    });

    const events = [];
    for await (const event of toRunOutputEvents(streamed)) {
      events.push(event);
    }

    assert.deepEqual(
      events.map((event) => event.type),
      ["text_delta", "text_delta", "text_delta", "completed"],
    );

    const completed = events.at(-1);
    assert.equal(completed?.type, "completed");
    if (!completed || completed.type !== "completed") {
      throw new Error("Expected completed event.");
    }

    assert.equal(completed.finalOutput, "Final answer.");
    assert.notEqual(completed.history, streamed.history);
    assert.deepEqual(completed.history, streamed.history);
    assert.equal(completed.lastAgent.name, "Run output events agent");
    assert.equal(completed.toolCalls.length, 1);
    assert.equal(completed.toolCalls[0]?.name, "lookup");
    assert.equal(completed.toolCalls[0]?.hasOutput, true);
    assert.deepEqual(completed.toolCalls[0]?.output, {
      status: "ok",
      code: null,
      publicReason: null,
      data: {
        chunks: [
          {
            number: 1,
            text: "Result for aioc",
          },
        ],
      },
    });
  }

  {
    const toolPolicy: ToolPolicy = () => allow("allow_lookup");
    setDefaultProvider(new ScriptedProvider(createToolTurns()));

    const streamed = await run(createLookupAgent(), "Find chunks.", {
      stream: true,
      policies: { toolPolicy },
    });

    const events = [];
    for await (const event of toRunOutputEvents(streamed, {
      emitToolCalls: true,
      emitToolOutputs: true,
    })) {
      events.push(event);
    }

    assert.deepEqual(
      events.map((event) => event.type),
      [
        "text_delta",
        "tool_call",
        "tool_output",
        "text_delta",
        "text_delta",
        "completed",
      ],
    );

    const toolOutput = events.find((event) => event.type === "tool_output");
    assert.equal(toolOutput?.type, "tool_output");
    if (!toolOutput || toolOutput.type !== "tool_output") {
      throw new Error("Expected tool_output event.");
    }
    assert.equal(toolOutput.item.callId, "lookup-1");
    assert.equal(toolOutput.toolCall?.name, "lookup");
  }

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
    const handoffPolicy: HandoffPolicy = () => allow("allow_handoff");
    setDefaultProvider(
      new ScriptedProvider([
        [
          {
            type: "tool_call",
            callId: "handoff-1",
            name: toHandoffToolName(targetAgent.name),
            arguments: JSON.stringify({ reason: "route" }),
          },
        ],
        [
          {
            type: "completed",
            message: "Handled by target.",
          },
        ],
      ]),
    );

    const streamed = await run(sourceAgent, "Route me.", {
      stream: true,
      policies: { handoffPolicy },
    });

    const events = [];
    for await (const event of toRunOutputEvents(streamed, {
      emitAgentUpdates: true,
    })) {
      events.push(event);
    }

    assert.deepEqual(
      events.map((event) => event.type),
      ["agent_updated", "completed"],
    );

    const agentUpdated = events[0];
    assert.equal(agentUpdated?.type, "agent_updated");
    if (!agentUpdated || agentUpdated.type !== "agent_updated") {
      throw new Error("Expected agent_updated event.");
    }
    assert.equal(agentUpdated.agent.name, "Target Agent");
  }

  {
    setDefaultProvider(new ThrowingProvider());

    const streamed = await run(
      new Agent({
        name: "Throwing provider agent",
        model: "fake-model",
      }),
      "Hello.",
      { stream: true },
    );

    const eventTypes: string[] = [];
    await assert.rejects(
      async () => {
        for await (const event of toRunOutputEvents(streamed)) {
          eventTypes.push(event.type);
        }
      },
      {
        message: "provider boom",
      },
    );

    assert.deepEqual(eventTypes, ["text_delta"]);
  }
}
