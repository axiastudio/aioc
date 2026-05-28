import { load as loadYaml } from "js-yaml";
import type {
  AgentHarnessDescriptor,
  HarnessAgentDescriptor,
} from "./harness-descriptor";
import {
  assertPromptFilePath,
  assertPromptFilePathList,
  createPathContext,
  createPromptMap,
  loadDescriptorFile,
  readResolvedPromptFiles,
  resolvePromptFilePath,
  type DescriptorPathContext,
  type ResolvedPromptFile,
} from "./harness-descriptor-loader-paths";

export type AgentHarnessPromptMap = Record<string, string>;

type HarnessAgentInstructionsInput =
  | {
      instructions?: string;
      instructions_file?: never;
      instructions_files?: never;
    }
  | {
      instructions_file: string;
      instructions?: never;
      instructions_files?: never;
    }
  | {
      instructions_files: string[];
      instructions?: string;
      instructions_file?: never;
    };

type HarnessAgentDescriptorInput = Omit<
  HarnessAgentDescriptor,
  "instructions"
> &
  HarnessAgentInstructionsInput;

type HarnessAgentDefaultsInput = Pick<
  HarnessAgentDescriptor,
  "model" | "modelSettings"
> &
  HarnessAgentInstructionsInput;

interface AgentHarnessDescriptorInput extends Omit<
  AgentHarnessDescriptor,
  "agent_defaults" | "agents"
> {
  agent_defaults?: HarnessAgentDefaultsInput;
  agents: Record<string, HarnessAgentDescriptorInput>;
}

export interface LoadAgentHarnessDescriptorOptions {
  descriptorPath?: string;
  rootDir?: string;
  promptMap?: AgentHarnessPromptMap;
}

export interface LoadAgentHarnessDescriptorFromFileOptions {
  rootDir?: string;
}

interface InstructionFilesInput {
  paths: string[];
  label: string;
  appendInlineInstructions: boolean;
}

interface InstructionFileReference {
  target: Record<string, unknown>;
  label: string;
  files: ResolvedPromptFile[];
  appendInlineInstructions: boolean;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeOptions(
  optionsOrPromptMap?:
    | LoadAgentHarnessDescriptorOptions
    | AgentHarnessPromptMap,
): LoadAgentHarnessDescriptorOptions {
  if (!optionsOrPromptMap) {
    return {};
  }

  if (
    Object.prototype.hasOwnProperty.call(
      optionsOrPromptMap,
      "descriptorPath",
    ) ||
    Object.prototype.hasOwnProperty.call(optionsOrPromptMap, "rootDir") ||
    Object.prototype.hasOwnProperty.call(optionsOrPromptMap, "promptMap")
  ) {
    return optionsOrPromptMap as LoadAgentHarnessDescriptorOptions;
  }

  return { promptMap: optionsOrPromptMap as AgentHarnessPromptMap };
}

function parseDescriptorYaml(
  yaml: string,
  descriptorLabel: string,
): AgentHarnessDescriptorInput {
  const parsed = loadYaml(yaml);
  if (!isPlainObject(parsed)) {
    throw new Error(`Invalid harness descriptor YAML: ${descriptorLabel}`);
  }
  return parsed as unknown as AgentHarnessDescriptorInput;
}

function collectInstructionFileReferences(
  descriptor: AgentHarnessDescriptorInput,
  context: DescriptorPathContext,
): InstructionFileReference[] {
  const references: InstructionFileReference[] = [];

  const defaultReference = createInstructionFileReference(
    descriptor.agent_defaults,
    "Harness descriptor agent_defaults",
    context,
  );
  if (defaultReference) {
    references.push(defaultReference);
  }

  if (!isPlainObject(descriptor.agents)) {
    return references;
  }

  for (const [agentId, agentDescriptor] of Object.entries(descriptor.agents)) {
    const agentReference = createInstructionFileReference(
      agentDescriptor,
      `Harness descriptor agent "${agentId}"`,
      context,
    );
    if (agentReference) {
      references.push(agentReference);
    }
  }

  return references;
}

function createInstructionFileReference(
  value: unknown,
  label: string,
  context: DescriptorPathContext,
): InstructionFileReference | undefined {
  if (!isPlainObject(value)) {
    return undefined;
  }

  const input = readInstructionFilesInput(value, label);
  if (!input) {
    return undefined;
  }

  return {
    target: value,
    label,
    files: input.paths.map((filePath, index) => ({
      ...resolvePromptFilePath(
        filePath,
        context,
        input.paths.length === 1 ? input.label : `${input.label}[${index}]`,
      ),
    })),
    appendInlineInstructions: input.appendInlineInstructions,
  };
}

function readInstructionFilesInput(
  value: Record<string, unknown>,
  label: string,
): InstructionFilesInput | undefined {
  const hasInstructionFile = hasDefined(value, "instructions_file");
  const hasInstructionFiles = hasDefined(value, "instructions_files");

  if (!hasInstructionFile && !hasInstructionFiles) {
    return undefined;
  }

  assertInstructionFileFields(value, label, {
    hasInstructionFile,
    hasInstructionFiles,
  });

  if (hasInstructionFile) {
    const fileLabel = `${label}.instructions_file`;
    const rawPath = value.instructions_file;
    assertPromptFilePath(rawPath, fileLabel);
    return {
      paths: [rawPath],
      label: fileLabel,
      appendInlineInstructions: false,
    };
  }

  const filesLabel = `${label}.instructions_files`;
  const rawPaths = value.instructions_files;
  assertPromptFilePathList(rawPaths, filesLabel);
  return {
    paths: rawPaths,
    label: filesLabel,
    appendInlineInstructions: true,
  };
}

function hasDefined(value: Record<string, unknown>, key: string): boolean {
  return key in value && typeof value[key] !== "undefined";
}

function assertInstructionFileFields(
  value: Record<string, unknown>,
  label: string,
  fields: {
    hasInstructionFile: boolean;
    hasInstructionFiles: boolean;
  },
) {
  const { hasInstructionFile, hasInstructionFiles } = fields;

  if (hasInstructionFile && hasInstructionFiles) {
    throw new Error(
      `${label}.instructions_file and ${label}.instructions_files are mutually exclusive.`,
    );
  }

  if (hasInstructionFile && typeof value.instructions !== "undefined") {
    throw new Error(
      `${label}.instructions and ${label}.instructions_file are mutually exclusive.`,
    );
  }

  if (
    hasInstructionFiles &&
    typeof value.instructions !== "undefined" &&
    typeof value.instructions !== "string"
  ) {
    throw new Error(
      `${label}.instructions must be a string when used with ${label}.instructions_files.`,
    );
  }
}

function materializeInstructionReference(
  reference: InstructionFileReference,
  contents: string[],
) {
  const parts = [...contents];
  const inlineInstructions = reference.target.instructions;

  if (
    reference.appendInlineInstructions &&
    typeof inlineInstructions === "string" &&
    inlineInstructions.length > 0
  ) {
    parts.push(inlineInstructions);
  }

  reference.target.instructions = parts.join("\n\n");
  delete reference.target.instructions_file;
  delete reference.target.instructions_files;
}

function readPromptMapContents(
  reference: InstructionFileReference,
  promptMap: Map<string, string>,
): string[] {
  return reference.files.map((file) => {
    const content = promptMap.get(file.resolvedPath);
    if (typeof content === "undefined") {
      throw new Error(
        `Missing promptMap entry for ${reference.label} prompt file "${file.rawPath}".`,
      );
    }
    return content;
  });
}

export function loadAgentHarnessDescriptor(
  yaml: string,
  optionsOrPromptMap?:
    | LoadAgentHarnessDescriptorOptions
    | AgentHarnessPromptMap,
): AgentHarnessDescriptor {
  const options = normalizeOptions(optionsOrPromptMap);
  const context = createPathContext(options);
  const promptMap = options.promptMap
    ? createPromptMap(options.promptMap, context)
    : undefined;
  const descriptor = parseDescriptorYaml(yaml, context.descriptorLabel);
  const references = collectInstructionFileReferences(descriptor, context);

  if (references.length > 0 && !promptMap) {
    throw new Error(
      "loadAgentHarnessDescriptor(...) requires promptMap when the descriptor uses instructions_file or instructions_files. Use loadAgentHarnessDescriptorFromFile(...) to read prompt files from disk.",
    );
  }

  if (!promptMap) {
    return descriptor as AgentHarnessDescriptor;
  }

  for (const reference of references) {
    const contents = readPromptMapContents(reference, promptMap);
    materializeInstructionReference(reference, contents);
  }

  return descriptor as AgentHarnessDescriptor;
}

export async function loadAgentHarnessDescriptorFromFile(
  descriptorPath: string,
  options: LoadAgentHarnessDescriptorFromFileOptions = {},
): Promise<AgentHarnessDescriptor> {
  const loaded = await loadDescriptorFile(descriptorPath, options);
  const descriptor = parseDescriptorYaml(loaded.yaml, loaded.descriptorLabel);
  const references = collectInstructionFileReferences(
    descriptor,
    loaded.context,
  );

  for (const reference of references) {
    const contents = await readResolvedPromptFiles(
      reference.files,
      reference.label,
      loaded.rootRealPath,
    );
    materializeInstructionReference(reference, contents);
  }

  return descriptor as AgentHarnessDescriptor;
}
