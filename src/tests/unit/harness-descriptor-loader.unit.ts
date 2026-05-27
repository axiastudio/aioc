import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildAgentHarness,
  hashAgentHarnessDescriptor,
  loadAgentHarnessDescriptor,
  loadAgentHarnessDescriptorFromFile,
  RunContext,
} from "../../index";

interface LoaderHarnessTestContext {
  state: {
    phase: string;
  };
}

const DESCRIPTOR_YAML = `
descriptor_version: aioc.agent_graph.v0
runtime:
  entry_agent: router
context:
  references:
    "state.phase":
      type: string
agents:
  router:
    instructions_file: ./prompts/router.md
`;

const DESCRIPTOR_FILES_YAML = `
descriptor_version: aioc.agent_graph.v0
runtime:
  entry_agent: router
context:
  references:
    "state.phase":
      type: string
agents:
  router:
    instructions_files:
      - ./prompts/shared.md
      - ./prompts/router.md
    instructions: Inline phase {{context.state.phase}}.
`;

export async function runHarnessDescriptorLoaderUnitTests(): Promise<void> {
  {
    const descriptor = loadAgentHarnessDescriptor(DESCRIPTOR_YAML, {
      descriptorPath: "/workspace/harness.yaml",
      rootDir: "/workspace",
      promptMap: {
        "./prompts/router.md": "Route phase {{context.state.phase}}.",
      },
    });

    assert.equal(
      descriptor.agents.router?.instructions,
      "Route phase {{context.state.phase}}.",
    );
    assert.equal(
      "instructions_file" in
        (descriptor.agents.router as Record<string, unknown>),
      false,
    );
    assert.equal(
      "instructions_files" in
        (descriptor.agents.router as Record<string, unknown>),
      false,
    );

    const harness = buildAgentHarness<LoaderHarnessTestContext>(descriptor);
    const instructions = await harness.entryAgent.resolveInstructions(
      new RunContext({
        state: {
          phase: "assessment",
        },
      }),
    );
    assert.equal(instructions, "Route phase assessment.");
  }

  {
    const descriptor = loadAgentHarnessDescriptor(
      `
runtime:
  entry_agent: router
agent_defaults:
  instructions_file: ./prompts/default.md
agents:
  router: {}
`,
      {
        descriptorPath: "/workspace/harness.yaml",
        rootDir: "/workspace",
        promptMap: {
          "./prompts/default.md": "Default agent prompt.",
        },
      },
    );

    const harness = buildAgentHarness(descriptor);
    const instructions = await harness.entryAgent.resolveInstructions(
      new RunContext({}),
    );
    assert.equal(instructions, "Default agent prompt.");
  }

  {
    const descriptor = loadAgentHarnessDescriptor(DESCRIPTOR_YAML, {
      "./prompts/router.md": "Prompt from direct map.",
    });

    assert.equal(
      descriptor.agents.router?.instructions,
      "Prompt from direct map.",
    );
  }

  {
    const descriptor = loadAgentHarnessDescriptor(DESCRIPTOR_FILES_YAML, {
      descriptorPath: "/workspace/harness.yaml",
      rootDir: "/workspace",
      promptMap: {
        "./prompts/shared.md": "Shared prompt.",
        "./prompts/router.md": "Router prompt.",
      },
    });

    assert.equal(
      descriptor.agents.router?.instructions,
      [
        "Shared prompt.",
        "Router prompt.",
        "Inline phase {{context.state.phase}}.",
      ].join("\n\n"),
    );
    assert.equal(
      "instructions_files" in
        (descriptor.agents.router as Record<string, unknown>),
      false,
    );

    const harness = buildAgentHarness<LoaderHarnessTestContext>(descriptor);
    const instructions = await harness.entryAgent.resolveInstructions(
      new RunContext({
        state: {
          phase: "combat",
        },
      }),
    );
    assert.equal(
      instructions,
      ["Shared prompt.", "Router prompt.", "Inline phase combat."].join("\n\n"),
    );
  }

  {
    const firstDescriptor = loadAgentHarnessDescriptor(DESCRIPTOR_YAML, {
      descriptorPath: "/workspace/harness.yaml",
      rootDir: "/workspace",
      promptMap: {
        "./prompts/router.md": "Prompt v1.",
      },
    });
    const secondDescriptor = loadAgentHarnessDescriptor(DESCRIPTOR_YAML, {
      descriptorPath: "/workspace/harness.yaml",
      rootDir: "/workspace",
      promptMap: {
        "./prompts/router.md": "Prompt v2.",
      },
    });

    assert.notEqual(
      hashAgentHarnessDescriptor(firstDescriptor),
      hashAgentHarnessDescriptor(secondDescriptor),
    );
  }

  {
    assert.throws(
      () =>
        loadAgentHarnessDescriptor(
          `
runtime:
  entry_agent: router
agents:
  router:
    instructions: Inline prompt.
    instructions_file: ./prompts/router.md
`,
          {
            descriptorPath: "/workspace/harness.yaml",
            rootDir: "/workspace",
            promptMap: {
              "./prompts/router.md": "File prompt.",
            },
          },
        ),
      /mutually exclusive/,
    );
  }

  {
    assert.throws(
      () =>
        loadAgentHarnessDescriptor(
          `
runtime:
  entry_agent: router
agents:
  router:
    instructions_file: ./prompts/router.md
    instructions_files:
      - ./prompts/shared.md
`,
          {
            descriptorPath: "/workspace/harness.yaml",
            rootDir: "/workspace",
            promptMap: {
              "./prompts/router.md": "File prompt.",
              "./prompts/shared.md": "Shared prompt.",
            },
          },
        ),
      /mutually exclusive/,
    );
  }

  {
    assert.throws(
      () =>
        loadAgentHarnessDescriptor(
          `
runtime:
  entry_agent: router
agents:
  router:
    instructions_files: []
`,
          {
            descriptorPath: "/workspace/harness.yaml",
            rootDir: "/workspace",
            promptMap: {},
          },
        ),
      /non-empty array/,
    );
  }

  {
    assert.throws(
      () =>
        loadAgentHarnessDescriptor(
          `
runtime:
  entry_agent: router
agents:
  router:
    instructions_file: ../router.md
`,
          {
            descriptorPath: "/workspace/harness.yaml",
            rootDir: "/workspace",
            promptMap: {
              "../router.md": "Escaped prompt.",
            },
          },
        ),
      /inside rootDir/,
    );
  }

  {
    assert.throws(
      () =>
        loadAgentHarnessDescriptor(
          `
runtime:
  entry_agent: router
agents:
  router:
    instructions_file: https://example.com/router.md
`,
          {
            descriptorPath: "/workspace/harness.yaml",
            rootDir: "/workspace",
            promptMap: {},
          },
        ),
      /remote URL/,
    );
  }

  {
    assert.throws(
      () =>
        loadAgentHarnessDescriptor(
          `
runtime:
  entry_agent: router
agents:
  router:
    instructions_file: ./prompts/*.md
`,
          {
            descriptorPath: "/workspace/harness.yaml",
            rootDir: "/workspace",
            promptMap: {},
          },
        ),
      /globbing/,
    );
  }

  {
    assert.throws(
      () =>
        loadAgentHarnessDescriptor(DESCRIPTOR_YAML, {
          descriptorPath: "/workspace/harness.yaml",
          rootDir: "/workspace",
        }),
      /requires promptMap/,
    );
  }

  {
    assert.throws(
      () =>
        buildAgentHarness({
          runtime: {
            entry_agent: "router",
          },
          agents: {
            router: {
              instructions_file: "./prompts/router.md",
            } as never,
          },
        }),
      /loadAgentHarnessDescriptor/,
    );
  }

  {
    assert.throws(
      () =>
        buildAgentHarness({
          runtime: {
            entry_agent: "router",
          },
          agents: {
            router: {
              instructions_files: ["./prompts/router.md"],
            } as never,
          },
        }),
      /loadAgentHarnessDescriptor/,
    );
  }

  {
    const tempDir = await mkdtemp(join(tmpdir(), "aioc-loader-"));
    try {
      await mkdir(join(tempDir, "prompts"));
      await writeFile(
        join(tempDir, "prompts", "router.md"),
        "Loaded from file.",
      );
      await writeFile(join(tempDir, "prompts", "shared.md"), "Shared file.");
      await writeFile(join(tempDir, "harness.yaml"), DESCRIPTOR_YAML);

      const descriptor = await loadAgentHarnessDescriptorFromFile(
        join(tempDir, "harness.yaml"),
      );

      assert.equal(descriptor.agents.router?.instructions, "Loaded from file.");

      await writeFile(join(tempDir, "harness.yaml"), DESCRIPTOR_FILES_YAML);

      const descriptorWithFiles = await loadAgentHarnessDescriptorFromFile(
        join(tempDir, "harness.yaml"),
      );

      assert.equal(
        descriptorWithFiles.agents.router?.instructions,
        [
          "Shared file.",
          "Loaded from file.",
          "Inline phase {{context.state.phase}}.",
        ].join("\n\n"),
      );
    } finally {
      await rm(tempDir, {
        recursive: true,
        force: true,
      });
    }
  }
}
