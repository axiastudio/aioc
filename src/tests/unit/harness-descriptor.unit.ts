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

interface CosmoHarnessTestContext {
  prompt: {
    kolbEnabledLabel: string;
    learningStyleLabel: string;
    assessmentStatus: string;
    phase: string;
    styleHint: string;
    kolbStage: string;
    lastGate: string;
    answersCountLabel: string;
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
    const descriptor: AgentHarnessDescriptor = {
      descriptor_version: "aioc.agent_graph.v0",
      metadata: {
        name: "cosmo_ai_runtime",
        version: "cosmo-shaped.v0",
      },
      runtime: {
        entry_agent: "router",
        max_turns: 10,
      },
      context: {
        references: {
          "prompt.kolbEnabledLabel": {
            type: "string",
          },
          "prompt.learningStyleLabel": {
            type: "string",
          },
          "prompt.assessmentStatus": {
            type: "string",
          },
          "prompt.phase": {
            type: "string",
          },
          "prompt.styleHint": {
            type: "string",
          },
          "prompt.kolbStage": {
            type: "string",
          },
          "prompt.lastGate": {
            type: "string",
          },
          "prompt.answersCountLabel": {
            type: "string",
          },
        },
      },
      tools: {
        find_chunks: {
          target: "cosmo://tool/find_chunks",
        },
        get_summary: {
          target: "cosmo://tool/get_summary",
        },
        set_kolb_state: {
          target: "cosmo://tool/set_kolb_state",
        },
        save_assessment_progress: {
          target: "cosmo://tool/save_assessment_progress",
        },
        complete_assessment: {
          target: "cosmo://tool/complete_assessment",
        },
      },
      agent_defaults: {
        model: "gpt-5.4-mini",
      },
      agents: {
        router: {
          name: "Router agent",
          handoffDescription:
            "Entry agent that routes each turn to assessment, tutor, or qna.",
          modelSettings: {
            reasoning: {
              effort: "minimal",
            },
            text: {
              verbosity: "low",
            },
          },
          handoffs: ["assessment", "tutor", "qna"],
          instructions: [
            "You are Cosmo's routing agent.",
            "Kolb enabled: {{context.prompt.kolbEnabledLabel}}.",
            "Learning style: {{context.prompt.learningStyleLabel}}.",
            "Assessment status: {{context.prompt.assessmentStatus}}.",
            "Conversation phase: {{context.prompt.phase}}.",
            "Hand off to exactly one specialist agent.",
          ].join("\n"),
        },
        assessment: {
          name: "Assessment agent",
          handoffDescription:
            "Runs the Kolb assessment flow and hands off to tutor when completed.",
          modelSettings: {
            reasoning: {
              effort: "low",
            },
            text: {
              verbosity: "medium",
            },
          },
          tools: ["save_assessment_progress", "complete_assessment"],
          handoffs: ["tutor"],
          instructions: [
            "You are the Cosmo Kolb assessment agent.",
            "Assessment status: {{context.prompt.assessmentStatus}}.",
            "Recorded answers: {{context.prompt.answersCountLabel}}.",
          ].join("\n"),
        },
        tutor: {
          name: "Tutor agent",
          handoffDescription:
            "Kolb tutor that explains, guides, and applies concepts with grounded coaching.",
          modelSettings: {
            reasoning: {
              effort: "low",
            },
            text: {
              verbosity: "medium",
            },
          },
          tools: ["find_chunks", "get_summary", "set_kolb_state"],
          instructions: [
            "You are Cosmo's Kolb tutor.",
            "Current style: {{context.prompt.learningStyleLabel}}.",
            "Current stage: {{context.prompt.kolbStage}}.",
            "Last gate result: {{context.prompt.lastGate}}.",
            "{{context.prompt.styleHint}}",
          ].join("\n"),
        },
        qna: {
          name: "QnA agent",
          handoffDescription:
            "Answers factual and document-grounded questions using retrieval.",
          modelSettings: {
            reasoning: {
              effort: "low",
            },
            text: {
              verbosity: "medium",
            },
          },
          tools: ["find_chunks", "get_summary"],
          instructions:
            "Always invoke find_chunks before answering. Phase: {{context.prompt.phase}}.",
        },
      },
    };
    const findChunks = tool<CosmoHarnessTestContext>({
      name: "find_chunks",
      description: "Retrieve knowledge base snippets.",
      parameters: z.object({
        query: z.string(),
      }),
      execute: ({ query }) => ({ chunks: [], query }),
    });
    const getSummary = tool<CosmoHarnessTestContext>({
      name: "get_summary",
      description: "Retrieve a lecture summary.",
      parameters: z.object({
        uuid: z.string(),
      }),
      execute: ({ uuid }) => ({ text: `summary ${uuid}` }),
    });
    const setKolbState = tool<CosmoHarnessTestContext>({
      name: "set_kolb_state",
      description: "Persist the next Kolb tutoring state.",
      execute: () => ({ ok: true }),
    });
    const saveAssessmentProgress = tool<CosmoHarnessTestContext>({
      name: "save_assessment_progress",
      description: "Persist assessment progress.",
      execute: () => ({ ok: true }),
    });
    const completeAssessment = tool<CosmoHarnessTestContext>({
      name: "complete_assessment",
      description: "Complete the learning-style assessment.",
      parameters: z.object({
        style: z.string(),
      }),
      execute: ({ style }) => ({ ok: true, style }),
    });
    const harness = buildAgentHarness<CosmoHarnessTestContext>(descriptor, {
      registryVersion: "cosmo-tools@test",
      tools: {
        "cosmo://tool/find_chunks": findChunks,
        "cosmo://tool/get_summary": getSummary,
        "cosmo://tool/set_kolb_state": setKolbState,
        "cosmo://tool/save_assessment_progress": saveAssessmentProgress,
        "cosmo://tool/complete_assessment": completeAssessment,
      },
    });
    const context: CosmoHarnessTestContext = {
      prompt: {
        kolbEnabledLabel: "yes",
        learningStyleLabel: "missing",
        assessmentStatus: "not_started",
        phase: "direct_answer",
        styleHint: "Style modulation: balanced.",
        kolbStage: "CE",
        lastGate: "unknown",
        answersCountLabel: "0",
      },
    };
    const routerInstructions = await harness.entryAgent.resolveInstructions(
      new RunContext(context),
    );
    const tutorAgent = harness.agents.get("tutor");
    const tutorInstructions = await tutorAgent?.resolveInstructions(
      new RunContext(context),
    );

    assert.equal(harness.entryAgent.name, "Router agent");
    assert.equal(harness.runOptions.maxTurns, 10);
    assert.equal(harness.metadata.name, "cosmo_ai_runtime");
    assert.equal(harness.metadata.version, "cosmo-shaped.v0");
    assert.equal(harness.metadata.registryVersion, "cosmo-tools@test");
    assert.deepEqual(
      harness.entryAgent.handoffs.map((agent) => agent.name),
      ["Assessment agent", "Tutor agent", "QnA agent"],
    );
    assert.deepEqual(
      harness.agents.get("assessment")?.handoffs.map((agent) => agent.name),
      ["Tutor agent"],
    );
    assert.deepEqual(
      harness.agents.get("qna")?.tools.map((item) => item.name),
      ["find_chunks", "get_summary"],
    );
    assert.deepEqual(
      tutorAgent?.tools.map((item) => item.name),
      ["find_chunks", "get_summary", "set_kolb_state"],
    );
    assert.equal(
      routerInstructions,
      [
        "You are Cosmo's routing agent.",
        "Kolb enabled: yes.",
        "Learning style: missing.",
        "Assessment status: not_started.",
        "Conversation phase: direct_answer.",
        "Hand off to exactly one specialist agent.",
      ].join("\n"),
    );
    assert.equal(
      tutorInstructions,
      [
        "You are Cosmo's Kolb tutor.",
        "Current style: missing.",
        "Current stage: CE.",
        "Last gate result: unknown.",
        "Style modulation: balanced.",
      ].join("\n"),
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
