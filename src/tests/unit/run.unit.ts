import assert from "node:assert/strict";
import { Agent, run, setDefaultProvider } from "../../index";
import { ScriptedProvider } from "../support/scripted-provider";

function isAssistantMessage(
  item: Awaited<ReturnType<typeof run>>["history"][number],
): item is Extract<
  Awaited<ReturnType<typeof run>>["history"][number],
  { type: "message" }
> {
  return item.type === "message" && item.role === "assistant";
}

export async function runRunUnitTests(): Promise<void> {
  setDefaultProvider(
    new ScriptedProvider([
      [
        { type: "delta", delta: "Hello " },
        { type: "delta", delta: "world." },
        { type: "completed", message: "Hello world." },
      ],
    ]),
  );

  const agent = new Agent({
    name: "Run unit agent",
    model: "fake-model",
  });

  const result = await run(agent, "Hi");

  assert.equal(result.finalOutput, "Hello world.");
  const assistantMessages = result.history.filter(isAssistantMessage);
  assert.equal(assistantMessages.length, 1);
  assert.equal(assistantMessages[0]?.content, "Hello world.");
}
