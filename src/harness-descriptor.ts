import { Agent } from "./agent";
import { hashCanonicalJsonValue } from "./canonical-json";
import type { Tool } from "./tool";
import type { NonStreamRunOptions } from "./types";

export interface HarnessDescriptorMetadata {
  name?: string;
  version?: string;
  [key: string]: unknown;
}

export interface HarnessRuntimeDescriptor {
  entry_agent: string;
  max_turns?: number;
}

export interface HarnessToolDescriptor {
  target: string;
}

export interface HarnessAgentDescriptor {
  name?: string;
  handoffDescription?: string;
  instructions?: string;
  model?: string;
  modelSettings?: Record<string, unknown>;
  tools?: string[];
  handoffs?: string[];
}

export interface HarnessContextFieldDescriptor {
  type: string;
  default?: unknown;
  optional?: boolean;
  mutable?: boolean;
  redact?: boolean;
  [key: string]: unknown;
}

export interface HarnessContextDescriptor {
  fields?: Record<string, HarnessContextFieldDescriptor>;
}

export interface AgentHarnessDescriptor {
  descriptor_version?: string;
  metadata?: HarnessDescriptorMetadata;
  runtime: HarnessRuntimeDescriptor;
  context?: HarnessContextDescriptor;
  tools?: Record<string, HarnessToolDescriptor>;
  agent_defaults?: Pick<
    HarnessAgentDescriptor,
    "model" | "modelSettings" | "instructions"
  >;
  agents: Record<string, HarnessAgentDescriptor>;
}

export interface AgentHarnessRegistry<TContext = unknown> {
  tools?: Record<string, Tool<TContext>>;
  registryVersion?: string;
}

export interface CreateHarnessContextInput {
  message?: string;
  now?: string | Date;
  overrides?: unknown;
}

export interface AgentHarnessMetadata {
  name?: string;
  version?: string;
  descriptorVersion?: string;
  descriptorHash: string;
  registryVersion?: string;
}

export interface AgentHarness<TContext = unknown> {
  entryAgent: Agent<TContext>;
  agents: Map<string, Agent<TContext>>;
  descriptorHash: string;
  metadata: AgentHarnessMetadata;
  runOptions: Omit<NonStreamRunOptions<TContext>, "stream">;
  createContext(input?: CreateHarnessContextInput): TContext;
}

function cloneJsonValue(value: unknown): unknown {
  if (typeof value === "undefined") {
    return undefined;
  }
  return JSON.parse(JSON.stringify(value)) as unknown;
}

function setPath(
  target: Record<string, unknown>,
  path: string,
  value: unknown,
) {
  const segments = path.split(".").filter((segment) => segment.length > 0);
  if (segments.length === 0) {
    throw new Error("Context field path cannot be empty.");
  }

  let cursor = target;
  for (const segment of segments.slice(0, -1)) {
    const existing = cursor[segment];
    if (typeof existing !== "object" || existing === null) {
      const next: Record<string, unknown> = {};
      cursor[segment] = next;
      cursor = next;
      continue;
    }
    cursor = existing as Record<string, unknown>;
  }

  cursor[segments[segments.length - 1] as string] = value;
}

function mergeObject(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
) {
  for (const [key, value] of Object.entries(source)) {
    const current = target[key];
    if (
      current &&
      typeof current === "object" &&
      !Array.isArray(current) &&
      value &&
      typeof value === "object" &&
      !Array.isArray(value)
    ) {
      mergeObject(
        current as Record<string, unknown>,
        value as Record<string, unknown>,
      );
      continue;
    }
    target[key] = cloneJsonValue(value);
  }
}

function resolveDefaultValue(
  value: unknown,
  input: CreateHarnessContextInput,
): unknown {
  if (value === "{{input.message}}") {
    return input.message ?? "";
  }
  if (value === "{{runtime.now_iso}}") {
    const now = input.now ?? new Date();
    return now instanceof Date ? now.toISOString() : now;
  }
  return cloneJsonValue(value);
}

function createContextFromDescriptor<TContext>(
  descriptor: AgentHarnessDescriptor,
  input: CreateHarnessContextInput = {},
): TContext {
  const context: Record<string, unknown> = {};
  for (const [path, field] of Object.entries(
    descriptor.context?.fields ?? {},
  )) {
    if (!("default" in field)) {
      continue;
    }
    setPath(context, path, resolveDefaultValue(field.default, input));
  }

  if (
    input.overrides &&
    typeof input.overrides === "object" &&
    !Array.isArray(input.overrides)
  ) {
    mergeObject(context, input.overrides as Record<string, unknown>);
  }

  return context as TContext;
}

function resolveTool<TContext>(
  toolId: string,
  descriptor: AgentHarnessDescriptor,
  registry: AgentHarnessRegistry<TContext>,
): Tool<TContext> {
  const toolDescriptor = descriptor.tools?.[toolId];
  if (!toolDescriptor) {
    throw new Error(`Harness descriptor references unknown tool "${toolId}".`);
  }

  const toolDefinition = registry.tools?.[toolDescriptor.target];
  if (!toolDefinition) {
    throw new Error(
      `Harness registry is missing target "${toolDescriptor.target}" for tool "${toolId}".`,
    );
  }

  return toolDefinition;
}

export function hashAgentHarnessDescriptor(
  descriptor: AgentHarnessDescriptor,
): string {
  return `sha256:${hashCanonicalJsonValue(descriptor)}`;
}

export function buildAgentHarness<TContext = unknown>(
  descriptor: AgentHarnessDescriptor,
  registry: AgentHarnessRegistry<TContext> = {},
): AgentHarness<TContext> {
  const descriptorHash = hashAgentHarnessDescriptor(descriptor);
  const agents = new Map<string, Agent<TContext>>();

  for (const [agentId, agentDescriptor] of Object.entries(descriptor.agents)) {
    const agent = new Agent<TContext>({
      name: agentDescriptor.name ?? agentId,
      handoffDescription: agentDescriptor.handoffDescription,
      instructions:
        agentDescriptor.instructions ?? descriptor.agent_defaults?.instructions,
      model: agentDescriptor.model ?? descriptor.agent_defaults?.model,
      modelSettings:
        agentDescriptor.modelSettings ??
        descriptor.agent_defaults?.modelSettings,
      tools: (agentDescriptor.tools ?? []).map((toolId) =>
        resolveTool(toolId, descriptor, registry),
      ),
      handoffs: [],
    });
    agents.set(agentId, agent);
  }

  for (const [agentId, agentDescriptor] of Object.entries(descriptor.agents)) {
    const agent = agents.get(agentId);
    if (!agent) {
      continue;
    }
    agent.handoffs = (agentDescriptor.handoffs ?? []).map((handoffId) => {
      const handoffAgent = agents.get(handoffId);
      if (!handoffAgent) {
        throw new Error(
          `Harness descriptor references unknown handoff agent "${handoffId}" from "${agentId}".`,
        );
      }
      return handoffAgent;
    });
  }

  const entryAgent = agents.get(descriptor.runtime.entry_agent);
  if (!entryAgent) {
    throw new Error(
      `Harness descriptor entry_agent "${descriptor.runtime.entry_agent}" does not exist.`,
    );
  }

  return {
    entryAgent,
    agents,
    descriptorHash,
    metadata: {
      name: descriptor.metadata?.name,
      version: descriptor.metadata?.version,
      descriptorVersion: descriptor.descriptor_version,
      descriptorHash,
      registryVersion: registry.registryVersion,
    },
    runOptions: {
      maxTurns: descriptor.runtime.max_turns,
    },
    createContext: (input) => createContextFromDescriptor(descriptor, input),
  };
}
