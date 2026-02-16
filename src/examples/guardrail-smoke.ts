import assert from "node:assert/strict";
import {
  Agent,
  OutputGuardrailTripwireTriggered,
  defineOutputGuardrail,
  run,
  setDefaultProvider,
} from "../index";
import type {
  ModelProvider,
  ProviderEvent,
  ProviderRequest,
} from "../providers/base";
import type { AgentInputItem, RunStreamEvent } from "../types";

class ScriptedProvider implements ModelProvider {
  private readonly events: ProviderEvent[];

  constructor(events: ProviderEvent[]) {
    this.events = events;
  }

  async *stream<TContext = unknown>(
    _request: ProviderRequest<TContext>,
  ): AsyncIterable<ProviderEvent> {
    void _request;
    for (const event of this.events) {
      yield event;
    }
  }
}

const outputGuardrail = defineOutputGuardrail({
  name: "block_unsafe_output",
  execute: ({ outputText }) => ({
    tripwireTriggered: outputText.toLowerCase().includes("unsafe"),
    reason: "Output contains forbidden token 'unsafe'.",
    metadata: {
      matched: "unsafe",
    },
  }),
});

function getRawOutput(events: RunStreamEvent[]): string {
  return events
    .filter(
      (
        event,
      ): event is Extract<RunStreamEvent, { type: "raw_model_stream_event" }> =>
        event.type === "raw_model_stream_event",
    )
    .map((event) => event.data.delta ?? "")
    .join("");
}

function getMessageOutput(events: RunStreamEvent[]): string | null {
  const itemEvent = events.find(
    (
      event,
    ): event is Extract<RunStreamEvent, { type: "run_item_stream_event" }> =>
      event.type === "run_item_stream_event" &&
      event.item.type === "message_output_item",
  );
  if (!itemEvent) {
    return null;
  }
  return itemEvent.item.type === "message_output_item"
    ? itemEvent.item.content
    : null;
}

function isAssistantMessage(
  item: AgentInputItem,
): item is Extract<AgentInputItem, { type: "message" }> {
  return item.type === "message" && item.role === "assistant";
}

async function runPassingCase(): Promise<void> {
  setDefaultProvider(
    new ScriptedProvider([
      { type: "delta", delta: "Safe " },
      { type: "delta", delta: "answer." },
      { type: "completed", message: "Safe answer." },
    ]),
  );

  const agent = new Agent({
    name: "Guardrail pass",
    model: "fake-model",
    outputGuardrails: [outputGuardrail],
  });

  const streamed = await run(agent, "hello", { stream: true });
  const events: RunStreamEvent[] = [];

  for await (const event of streamed.toStream()) {
    events.push(event);
  }

  assert.equal(getRawOutput(events), "Safe answer.");
  assert.equal(getMessageOutput(events), "Safe answer.");

  const assistantMessages = streamed.history.filter(isAssistantMessage);
  assert.equal(assistantMessages.length, 1);
  assert.equal(assistantMessages[0]?.content, "Safe answer.");
}

async function runTripwireCase(): Promise<void> {
  setDefaultProvider(
    new ScriptedProvider([
      { type: "delta", delta: "unsafe answer" },
      { type: "completed", message: "unsafe answer" },
    ]),
  );

  const agent = new Agent({
    name: "Guardrail fail",
    model: "fake-model",
    outputGuardrails: [outputGuardrail],
  });

  const streamed = await run(agent, "hello", { stream: true });
  const events: RunStreamEvent[] = [];
  let capturedError: unknown = null;

  try {
    for await (const event of streamed.toStream()) {
      events.push(event);
    }
  } catch (error) {
    capturedError = error;
  }

  assert.ok(capturedError instanceof OutputGuardrailTripwireTriggered);
  assert.equal(capturedError.result.guardrail, "block_unsafe_output");
  assert.equal(capturedError.result.output.tripwireTriggered, true);
  assert.equal(capturedError.result.outputText, "unsafe answer");

  assert.equal(getRawOutput(events), "");
  assert.equal(getMessageOutput(events), null);

  const assistantMessages = streamed.history.filter(isAssistantMessage);
  assert.equal(assistantMessages.length, 0);
}

async function main(): Promise<void> {
  await runPassingCase();
  await runTripwireCase();
  process.stdout.write("Guardrail smoke passed.\n");
}

main().catch((error) => {
  const message =
    error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
