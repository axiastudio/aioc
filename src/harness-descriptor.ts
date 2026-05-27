import { Agent, type AgentInstructions } from "./agent";
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

export interface HarnessContextReferenceDescriptor {
  type?: string;
  optional?: boolean;
  [key: string]: unknown;
}

export type HarnessContextReferenceEntry =
  | boolean
  | HarnessContextReferenceDescriptor;

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
  references?: Record<string, HarnessContextReferenceEntry>;
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

interface PromptAccessRule {
  optional: boolean;
}

const CONTEXT_PROMPT_PLACEHOLDER = /\{\{\s*context\.([^}]+?)\s*\}\}/g;

function cloneJsonValue(value: unknown): unknown {
  if (typeof value === "undefined") {
    return undefined;
  }
  return JSON.parse(JSON.stringify(value)) as unknown;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertPlainObject(
  value: unknown,
  label: string,
): asserts value is Record<string, unknown> {
  if (!isPlainObject(value)) {
    throw new Error(`${label} must be an object.`);
  }
}

function assertOptionalPlainObject(value: unknown, label: string) {
  if (typeof value === "undefined") {
    return;
  }
  assertPlainObject(value, label);
}

function assertNonEmptyString(value: unknown, label: string) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }
}

function validateDescriptorShape(descriptor: AgentHarnessDescriptor) {
  assertPlainObject(descriptor, "Harness descriptor");
  assertPlainObject(descriptor.runtime, "Harness descriptor runtime");
  assertNonEmptyString(
    descriptor.runtime.entry_agent,
    "Harness descriptor runtime.entry_agent",
  );
  assertPlainObject(descriptor.agents, "Harness descriptor agents");

  if (Object.keys(descriptor.agents).length === 0) {
    throw new Error("Harness descriptor agents must not be empty.");
  }

  assertOptionalPlainObject(descriptor.metadata, "Harness descriptor metadata");
  assertOptionalPlainObject(descriptor.tools, "Harness descriptor tools");
  assertOptionalPlainObject(
    descriptor.agent_defaults,
    "Harness descriptor agent_defaults",
  );
  assertOptionalPlainObject(descriptor.context, "Harness descriptor context");
  assertOptionalPlainObject(
    descriptor.context?.fields,
    "Harness descriptor context.fields",
  );
  assertOptionalPlainObject(
    descriptor.context?.references,
    "Harness descriptor context.references",
  );

  for (const [toolId, toolDescriptor] of Object.entries(
    descriptor.tools ?? {},
  )) {
    assertPlainObject(toolDescriptor, `Harness descriptor tool "${toolId}"`);
    assertNonEmptyString(
      toolDescriptor.target,
      `Harness descriptor tool "${toolId}".target`,
    );
  }
}

function normalizePromptPath(path: string, label: string): string {
  const segments = path
    .split(".")
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);

  if (segments.length === 0) {
    throw new Error(`${label} cannot be empty.`);
  }

  for (const segment of segments) {
    if (!/^[A-Za-z0-9_-]+$/.test(segment)) {
      throw new Error(`${label} contains invalid segment "${segment}".`);
    }
  }

  return segments.join(".");
}

function createPromptReferenceRules(
  descriptor: AgentHarnessDescriptor,
): Map<string, PromptAccessRule> {
  const rules = new Map<string, PromptAccessRule>();

  for (const [path, reference] of Object.entries(
    descriptor.context?.references ?? {},
  )) {
    if (reference === false) {
      continue;
    }

    const normalizedPath = normalizePromptPath(path, "Context reference path");
    if (reference === true) {
      rules.set(normalizedPath, { optional: false });
      continue;
    }

    if (!isPlainObject(reference)) {
      throw new Error(
        `Context reference "${path}" must be true, false, or an object.`,
      );
    }

    rules.set(normalizedPath, { optional: Boolean(reference.optional) });
  }

  return rules;
}

function collectContextPromptPaths(template: string): string[] {
  const paths = new Set<string>();

  for (const match of template.matchAll(CONTEXT_PROMPT_PLACEHOLDER)) {
    const rawPath = match[1];
    if (!rawPath) {
      continue;
    }
    paths.add(
      normalizePromptPath(rawPath, `Context prompt placeholder "${match[0]}"`),
    );
  }

  return [...paths];
}

function readPromptPath(
  context: unknown,
  path: string,
): { exists: boolean; value: unknown } {
  let cursor = context;
  for (const segment of normalizePromptPath(path, "Context prompt path").split(
    ".",
  )) {
    if (typeof cursor !== "object" || cursor === null || !(segment in cursor)) {
      return { exists: false, value: undefined };
    }
    cursor = (cursor as Record<string, unknown>)[segment];
  }

  return { exists: true, value: cursor };
}

function stringifyPromptValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  ) {
    return String(value);
  }
  if (typeof value === "undefined") {
    return "";
  }

  const json = JSON.stringify(value);
  return typeof json === "undefined" ? String(value) : json;
}

function renderInstructionTemplate(
  template: string,
  context: unknown,
  promptAccessRules: Map<string, PromptAccessRule>,
): string {
  return template.replace(
    CONTEXT_PROMPT_PLACEHOLDER,
    (placeholder: string, rawPath: string) => {
      const path = normalizePromptPath(
        rawPath,
        `Context prompt placeholder "${placeholder}"`,
      );
      const rule = promptAccessRules.get(path);
      if (!rule) {
        throw new Error(
          `Harness descriptor instruction references undeclared context path "${path}".`,
        );
      }

      const resolved = readPromptPath(context, path);
      if (!resolved.exists || typeof resolved.value === "undefined") {
        if (rule.optional) {
          return "";
        }
        throw new Error(
          `Harness descriptor instruction could not resolve required context path "${path}".`,
        );
      }

      return stringifyPromptValue(resolved.value);
    },
  );
}

function compileAgentInstructions<TContext>(
  agentId: string,
  instructions: string | undefined,
  promptAccessRules: Map<string, PromptAccessRule>,
): AgentInstructions<TContext> | undefined {
  if (typeof instructions === "undefined") {
    return undefined;
  }

  const promptPaths = collectContextPromptPaths(instructions);
  if (promptPaths.length === 0) {
    return instructions;
  }

  for (const path of promptPaths) {
    if (!promptAccessRules.has(path)) {
      throw new Error(
        `Agent "${agentId}" instruction references undeclared context path "${path}".`,
      );
    }
  }

  return (runContext) =>
    renderInstructionTemplate(
      instructions,
      runContext.context,
      promptAccessRules,
    );
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
  validateDescriptorShape(descriptor);

  const descriptorHash = hashAgentHarnessDescriptor(descriptor);
  const agents = new Map<string, Agent<TContext>>();
  const promptAccessRules = createPromptReferenceRules(descriptor);

  for (const [agentId, agentDescriptor] of Object.entries(descriptor.agents)) {
    const instructions =
      agentDescriptor.instructions ?? descriptor.agent_defaults?.instructions;
    const agent = new Agent<TContext>({
      name: agentDescriptor.name ?? agentId,
      handoffDescription: agentDescriptor.handoffDescription,
      instructions: compileAgentInstructions(
        agentId,
        instructions,
        promptAccessRules,
      ),
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
