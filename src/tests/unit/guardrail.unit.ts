import assert from "node:assert/strict";
import {
  Agent,
  OutputGuardrailTripwireTriggered,
  defineOutputGuardrail,
  run,
  setDefaultProvider,
} from "../../index";
import { ScriptedProvider } from "../support/scripted-provider";

const outputGuardrail = defineOutputGuardrail({
  name: "block_unsafe_output",
  execute: ({ outputText }) => ({
    tripwireTriggered: outputText.toLowerCase().includes("unsafe"),
    reason: "Output contains forbidden token 'unsafe'.",
  }),
});

export async function runGuardrailUnitTests(): Promise<void> {
  setDefaultProvider(
    new ScriptedProvider([
      [
        { type: "delta", delta: "Safe " },
        { type: "delta", delta: "output." },
        { type: "completed", message: "Safe output." },
      ],
    ]),
  );

  const passAgent = new Agent({
    name: "Guardrail pass agent",
    model: "fake-model",
    outputGuardrails: [outputGuardrail],
  });

  const passResult = await run(passAgent, "hello");
  assert.equal(passResult.finalOutput, "Safe output.");

  setDefaultProvider(
    new ScriptedProvider([
      [
        { type: "delta", delta: "unsafe output" },
        { type: "completed", message: "unsafe output" },
      ],
    ]),
  );

  const failAgent = new Agent({
    name: "Guardrail fail agent",
    model: "fake-model",
    outputGuardrails: [outputGuardrail],
  });

  await assert.rejects(
    () => run(failAgent, "hello"),
    (error: unknown) => {
      assert.ok(error instanceof OutputGuardrailTripwireTriggered);
      assert.equal(error.result.guardrail, "block_unsafe_output");
      return true;
    },
  );
}
