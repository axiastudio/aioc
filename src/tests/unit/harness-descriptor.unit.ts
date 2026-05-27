import assert from "node:assert/strict";
import { z } from "zod";
import {
  allow,
  buildAgentHarness,
  hashAgentHarnessDescriptor,
  replayFromRunRecord,
  RunContext,
  setDefaultProvider,
  tool,
  type AgentHarnessDescriptor,
  type RunRecord,
} from "../../index";
import { ScriptedProvider } from "../support/scripted-provider";

interface HarnessTestContext {
  actorId: string;
  turn: {
    userMessage: string;
    startedAt: string;
  };
  language?: "en" | "it";
  state?: {
    phase?: string;
    hero?: {
      name?: string;
    };
    scene?: {
      pressurePoint?: string;
    };
  };
}

function createDescriptor(version: string): AgentHarnessDescriptor {
  return {
    descriptor_version: "aioc.agent_graph.v0",
    metadata: {
      name: "test_harness",
      version,
    },
    runtime: {
      entry_agent: "candidate",
      max_turns: 4,
    },
    context: {
      fields: {
        actorId: {
          type: "string",
          default: "actor-1",
          redact: true,
        },
        "turn.userMessage": {
          type: "string",
          default: "{{input.message}}",
        },
        "turn.startedAt": {
          type: "string",
          default: "{{runtime.now_iso}}",
        },
      },
    },
    tools: {
      lookup: {
        target: "test://tool/lookup",
      },
    },
    agent_defaults: {
      model: "fake-model",
      modelSettings: {
        reasoning: {
          effort: "minimal",
        },
      },
    },
    agents: {
      candidate: {
        name: "Candidate Agent",
        instructions: `Candidate instructions ${version}`,
        tools: ["lookup"],
      },
    },
  };
}

function createRunRecord(
  overrides: Partial<RunRecord<HarnessTestContext>> = {},
): RunRecord<HarnessTestContext> {
  return {
    runId: "source-run-1",
    startedAt: "2026-05-19T10:00:00.000Z",
    completedAt: "2026-05-19T10:00:01.000Z",
    status: "completed",
    agentName: "Candidate Agent",
    providerName: "ScriptedProvider",
    model: "fake-model",
    question: "lookup customer",
    response: "source response",
    contextSnapshot: {
      actorId: "actor-1",
      turn: {
        userMessage: "lookup customer",
        startedAt: "2026-05-19T10:00:00.000Z",
      },
    },
    contextRedacted: false,
    items: [],
    promptSnapshots: [],
    requestFingerprints: [],
    policyDecisions: [],
    metadata: {},
    ...overrides,
  };
}

export async function runHarnessDescriptorUnitTests(): Promise<void> {
  {
    const descriptor = createDescriptor("candidate-v1");
    const lookup = tool<HarnessTestContext>({
      name: "lookup",
      description: "Lookup test data",
      parameters: z.object({ id: z.string() }),
      execute: ({ id }) => ({ id, source: "live" }),
    });

    const harness = buildAgentHarness<HarnessTestContext>(descriptor, {
      registryVersion: "test-registry@1",
      tools: {
        "test://tool/lookup": lookup,
      },
    });

    const context = harness.createContext({
      message: "hello",
      now: "2026-05-19T12:00:00.000Z",
    });

    assert.equal(harness.entryAgent.name, "Candidate Agent");
    assert.equal(harness.entryAgent.model, "fake-model");
    assert.equal(harness.entryAgent.tools[0]?.name, "lookup");
    assert.equal(harness.runOptions.maxTurns, 4);
    assert.equal(harness.metadata.name, "test_harness");
    assert.equal(harness.metadata.version, "candidate-v1");
    assert.equal(harness.metadata.registryVersion, "test-registry@1");
    assert.equal(harness.metadata.descriptorHash, harness.descriptorHash);
    assert.equal(
      harness.descriptorHash,
      hashAgentHarnessDescriptor(descriptor),
    );
    assert.deepEqual(context, {
      actorId: "actor-1",
      turn: {
        userMessage: "hello",
        startedAt: "2026-05-19T12:00:00.000Z",
      },
    });
  }

  {
    assert.throws(
      () =>
        buildAgentHarness({
          runtime: {
            entry_agent: "candidate",
          },
          agents: {},
        } as AgentHarnessDescriptor),
      /agents must not be empty/,
    );
  }

  {
    assert.throws(
      () =>
        buildAgentHarness({
          runtime: {
            entry_agent: "",
          },
          agents: {
            candidate: {},
          },
        }),
      /runtime\.entry_agent must be a non-empty string/,
    );
  }

  {
    assert.throws(
      () =>
        buildAgentHarness({
          runtime: {
            entry_agent: "missing",
          },
          agents: {
            candidate: {},
          },
        }),
      /entry_agent "missing" does not exist/,
    );
  }

  {
    assert.throws(
      () =>
        buildAgentHarness({
          runtime: {
            entry_agent: "candidate",
          },
          agents: {
            candidate: {
              tools: ["missing_tool"],
            },
          },
        }),
      /references unknown tool "missing_tool"/,
    );
  }

  {
    assert.throws(
      () =>
        buildAgentHarness({
          runtime: {
            entry_agent: "candidate",
          },
          tools: {
            lookup: {
              target: "test://tool/missing",
            },
          },
          agents: {
            candidate: {
              tools: ["lookup"],
            },
          },
        }),
      /registry is missing target "test:\/\/tool\/missing"/,
    );
  }

  {
    assert.throws(
      () =>
        buildAgentHarness({
          runtime: {
            entry_agent: "candidate",
          },
          agents: {
            candidate: {
              handoffs: ["missing_agent"],
            },
          },
        }),
      /references unknown handoff agent "missing_agent"/,
    );
  }

  {
    const descriptor: AgentHarnessDescriptor = {
      descriptor_version: "aioc.agent_graph.v0",
      runtime: {
        entry_agent: "candidate",
      },
      context: {
        fields: {
          language: {
            type: "enum",
            values: ["en", "it"],
          },
          state: {
            type: "object",
          },
        },
        references: {
          language: {
            type: "enum",
            values: ["en", "it"],
          },
          "state.phase": {
            type: "string",
          },
          "state.hero.name": {
            type: "string",
            optional: true,
          },
          "state.scene.pressurePoint": {
            type: "string",
            optional: true,
          },
        },
      },
      agents: {
        candidate: {
          instructions:
            "Language {{context.language}}. Phase {{context.state.phase}}. Hero {{context.state.hero.name}}. Pressure {{context.state.scene.pressurePoint}}.",
        },
      },
    };

    const harness = buildAgentHarness<HarnessTestContext>(descriptor);
    const context = harness.createContext({
      overrides: {
        language: "en",
        state: {
          phase: "exploration",
          hero: {
            name: "Ada",
          },
          scene: {},
        },
      },
    });
    const instructions = await harness.entryAgent.resolveInstructions(
      new RunContext(context),
    );

    assert.equal(
      instructions,
      "Language en. Phase exploration. Hero Ada. Pressure .",
    );
  }

  {
    assert.throws(
      () =>
        buildAgentHarness<HarnessTestContext>({
          descriptor_version: "aioc.agent_graph.v0",
          runtime: {
            entry_agent: "candidate",
          },
          context: {
            fields: {
              state: {
                type: "object",
              },
            },
            references: {
              "state.phase": {
                type: "string",
              },
            },
          },
          agents: {
            candidate: {
              instructions: "Hero {{context.state.hero.name}}.",
            },
          },
        }),
      /undeclared context path/,
    );
  }

  {
    assert.throws(
      () =>
        buildAgentHarness<HarnessTestContext>({
          descriptor_version: "aioc.agent_graph.v0",
          runtime: {
            entry_agent: "candidate",
          },
          context: {
            references: {
              "state.phase": {
                type: "string",
              },
            },
          },
          agents: {
            candidate: {
              instructions: "Phase {{context.state.phase ?? missing}}.",
            },
          },
        }),
      /invalid segment/,
    );
  }

  {
    assert.throws(
      () =>
        buildAgentHarness<HarnessTestContext>({
          descriptor_version: "aioc.agent_graph.v0",
          runtime: {
            entry_agent: "candidate",
          },
          context: {
            references: {
              state: true,
            },
          },
          agents: {
            candidate: {
              instructions: "Phase {{context.state.phase}}.",
            },
          },
        }),
      /undeclared context path "state.phase"/,
    );
  }

  {
    const harness = buildAgentHarness<HarnessTestContext>({
      descriptor_version: "aioc.agent_graph.v0",
      runtime: {
        entry_agent: "candidate",
      },
      context: {
        fields: {
          state: {
            type: "object",
          },
        },
        references: {
          "state.phase": {
            type: "string",
          },
        },
      },
      agents: {
        candidate: {
          instructions: "Phase {{context.state.phase}}.",
        },
      },
    });

    await assert.rejects(
      () =>
        harness.entryAgent.resolveInstructions(
          new RunContext({
            actorId: "actor-1",
            turn: {
              userMessage: "hello",
              startedAt: "2026-05-19T12:00:00.000Z",
            },
            state: {},
          }),
        ),
      /could not resolve required context path "state.phase"/,
    );
  }

  {
    const sourceRunRecord = createRunRecord({
      items: [
        {
          type: "tool_call_item",
          callId: "source-call-1",
          name: "lookup",
          arguments: { id: "42" },
        },
        {
          type: "tool_call_output_item",
          callId: "source-call-1",
          output: { id: "42", source: "recorded" },
        },
      ],
    });

    setDefaultProvider(
      new ScriptedProvider([
        [
          {
            type: "tool_call",
            callId: "candidate-call-1",
            name: "lookup",
            arguments: JSON.stringify({ id: "42" }),
          },
        ],
        [{ type: "completed", message: "candidate response" }],
      ]),
    );

    let liveInvocations = 0;
    const lookup = tool<HarnessTestContext>({
      name: "lookup",
      description: "Lookup test data",
      parameters: z.object({ id: z.string() }),
      execute: ({ id }) => {
        liveInvocations += 1;
        return { id, source: "live" };
      },
    });

    const candidateHarness = buildAgentHarness<HarnessTestContext>(
      createDescriptor("candidate-v2"),
      {
        registryVersion: "test-registry@2",
        tools: {
          "test://tool/lookup": lookup,
        },
      },
    );
    const replayRecords: RunRecord<HarnessTestContext>[] = [];

    const replay = await replayFromRunRecord({
      sourceRunRecord,
      agent: candidateHarness.entryAgent,
      mode: "strict",
      metadataOverrides: {
        replayOfRunId: sourceRunRecord.runId,
        harness: candidateHarness.metadata,
      },
      runOptions: {
        ...candidateHarness.runOptions,
        policies: {
          toolPolicy: () => allow("allow_descriptor_replay"),
        },
        record: {
          sink: (record) => {
            replayRecords.push(record);
          },
        },
      },
    });

    assert.equal(replay.result.finalOutput, "candidate response");
    assert.equal(liveInvocations, 0);
    assert.equal(replay.replayStats.recordedToolCalls, 1);
    assert.equal(replay.replayStats.replayedFromRecord, 1);
    assert.equal(replay.replayStats.missingToolCalls, 0);
    assert.equal(replayRecords.length, 1);
    assert.equal(
      replay.replayRunRecord?.metadata?.replayOfRunId,
      "source-run-1",
    );
    assert.deepEqual(
      replay.replayRunRecord?.metadata?.harness,
      candidateHarness.metadata,
    );
  }
}
