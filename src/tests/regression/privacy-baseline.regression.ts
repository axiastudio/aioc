import assert from "node:assert/strict";
import { Agent, run, setDefaultProvider, type RunRecord } from "../../index";
import { ScriptedProvider } from "../support/scripted-provider";

interface PrivacyContext {
  actor: {
    userId: string;
    email: string;
    groups: string[];
  };
  tenantId: string;
}

export async function runPrivacyBaselineRegressionTests(): Promise<void> {
  const records: RunRecord<PrivacyContext>[] = [];

  setDefaultProvider(
    new ScriptedProvider([[{ type: "completed", message: "privacy-ok" }]]),
  );

  const agent = new Agent<PrivacyContext>({
    name: "Privacy baseline agent",
    model: "fake-model",
    promptVersion: "privacy-baseline.v1",
    instructions: "Provide a short answer.",
  });

  const result = await run(agent, "hello", {
    context: {
      actor: {
        userId: "u-1",
        email: "user@example.com",
        groups: ["finance"],
      },
      tenantId: "tenant-1",
    },
    record: {
      metadata: {
        appBuildVersion: "build-123",
        scenario: "privacy-baseline-regression",
        tenantRef: "tenant-1",
        traceClass: "restricted",
      },
      contextRedactor: (context) => ({
        contextSnapshot: {
          ...context,
          actor: {
            ...context.actor,
            userId: "[redacted]",
            email: "[redacted-email]",
          },
        },
        contextRedacted: true,
      }),
      sink: (record) => {
        records.push(record);
      },
    },
  });

  assert.equal(result.finalOutput, "privacy-ok");
  assert.equal(records.length, 1);
  assert.equal(records[0]?.status, "completed");
  assert.equal(records[0]?.contextRedacted, true);
  assert.equal(records[0]?.contextSnapshot.actor.userId, "[redacted]");
  assert.equal(records[0]?.contextSnapshot.actor.email, "[redacted-email]");
  assert.equal(records[0]?.promptSnapshots.length, 1);
  assert.equal(records[0]?.promptSnapshots[0]?.promptText, undefined);
  assert.equal(records[0]?.metadata?.appBuildVersion, "build-123");
  assert.equal(records[0]?.metadata?.scenario, "privacy-baseline-regression");
  assert.equal(records[0]?.metadata?.tenantRef, "tenant-1");
  assert.equal(records[0]?.metadata?.traceClass, "restricted");
}
