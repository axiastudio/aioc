import { readFile, realpath } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { load as loadYaml } from "js-yaml";
import type {
  AgentHarnessDescriptor,
  HarnessAgentDescriptor,
} from "./harness-descriptor";

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

interface DescriptorLoadContext {
  descriptorDir: string;
  descriptorLabel: string;
  rootDir: string;
  promptMap?: Map<string, string>;
}

interface InstructionFileReference {
  carrier: Record<string, unknown>;
  label: string;
  files: InstructionFileReferenceEntry[];
  appendInlineInstructions: boolean;
}

interface InstructionFileReferenceEntry {
  rawPath: string;
  resolvedPath: string;
}

const URL_LIKE_PATH = /^[A-Za-z][A-Za-z0-9+.-]*:\/\//;
const GLOB_LIKE_PATH = /[*?[\]{}]/;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertNonEmptyString(
  value: unknown,
  label: string,
): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }
}

function assertPathInsideRoot(path: string, rootDir: string, label: string) {
  const relativePath = relative(rootDir, path);
  if (
    relativePath === "" ||
    relativePath === ".." ||
    relativePath.startsWith(`..${sep}`) ||
    isAbsolute(relativePath)
  ) {
    throw new Error(`${label} must resolve inside rootDir "${rootDir}".`);
  }
}

function assertInstructionFilePath(
  value: unknown,
  label: string,
): asserts value is string {
  assertNonEmptyString(value, label);

  if (value.includes("\0")) {
    throw new Error(`${label} must not contain null bytes.`);
  }
  if (URL_LIKE_PATH.test(value)) {
    throw new Error(`${label} must not be a remote URL.`);
  }
  if (isAbsolute(value)) {
    throw new Error(`${label} must be relative to the descriptor file.`);
  }
  if (GLOB_LIKE_PATH.test(value)) {
    throw new Error(`${label} must not use globbing characters.`);
  }
}

function assertInstructionFilePathList(
  value: unknown,
  label: string,
): asserts value is string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${label} must be a non-empty array of strings.`);
  }

  for (const [index, path] of value.entries()) {
    assertInstructionFilePath(path, `${label}[${index}]`);
  }
}

function resolveInsideRoot(
  rawPath: string,
  context: DescriptorLoadContext,
  label: string,
  allowAbsolute: boolean,
): string {
  if (!allowAbsolute) {
    assertInstructionFilePath(rawPath, label);
  } else if (typeof rawPath !== "string" || rawPath.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  } else if (rawPath.includes("\0")) {
    throw new Error(`${label} must not contain null bytes.`);
  } else if (URL_LIKE_PATH.test(rawPath)) {
    throw new Error(`${label} must not be a remote URL.`);
  } else if (GLOB_LIKE_PATH.test(rawPath)) {
    throw new Error(`${label} must not use globbing characters.`);
  }

  const resolvedPath = isAbsolute(rawPath)
    ? resolve(rawPath)
    : resolve(context.descriptorDir, rawPath);
  assertPathInsideRoot(resolvedPath, context.rootDir, label);
  return resolvedPath;
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

function createLoadContext(
  options: LoadAgentHarnessDescriptorOptions,
): DescriptorLoadContext {
  const descriptorPath = options.descriptorPath
    ? resolve(options.descriptorPath)
    : undefined;
  const descriptorDir = descriptorPath
    ? dirname(descriptorPath)
    : resolve(options.rootDir ?? process.cwd());
  const rootDir = resolve(options.rootDir ?? descriptorDir);
  const context: DescriptorLoadContext = {
    descriptorDir,
    descriptorLabel: descriptorPath ?? "<inline descriptor>",
    rootDir,
  };

  if (options.promptMap) {
    context.promptMap = createPromptMap(options.promptMap, context);
  }

  return context;
}

function createPromptMap(
  promptMap: AgentHarnessPromptMap,
  context: DescriptorLoadContext,
): Map<string, string> {
  const normalized = new Map<string, string>();

  for (const [rawPath, content] of Object.entries(promptMap)) {
    if (typeof content !== "string") {
      throw new Error(`Prompt map entry "${rawPath}" must be a string.`);
    }

    const resolvedPath = resolveInsideRoot(
      rawPath,
      context,
      `Prompt map key "${rawPath}"`,
      true,
    );
    normalized.set(resolvedPath, content);
  }

  return normalized;
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
  context: DescriptorLoadContext,
): InstructionFileReference[] {
  const references: InstructionFileReference[] = [];

  collectInstructionFileReference(
    descriptor.agent_defaults,
    "Harness descriptor agent_defaults",
    context,
    references,
  );

  if (!isPlainObject(descriptor.agents)) {
    return references;
  }

  for (const [agentId, agentDescriptor] of Object.entries(descriptor.agents)) {
    collectInstructionFileReference(
      agentDescriptor,
      `Harness descriptor agent "${agentId}"`,
      context,
      references,
    );
  }

  return references;
}

function collectInstructionFileReference(
  value: unknown,
  label: string,
  context: DescriptorLoadContext,
  references: InstructionFileReference[],
) {
  if (!isPlainObject(value)) {
    return;
  }

  const hasInstructionFile =
    "instructions_file" in value &&
    typeof value.instructions_file !== "undefined";
  const hasInstructionFiles =
    "instructions_files" in value &&
    typeof value.instructions_files !== "undefined";

  if (!hasInstructionFile && !hasInstructionFiles) {
    return;
  }

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

  let rawPaths: string[];
  let fileLabel: string;
  if (hasInstructionFile) {
    fileLabel = `${label}.instructions_file`;
    assertInstructionFilePath(value.instructions_file, fileLabel);
    rawPaths = [value.instructions_file];
  } else {
    fileLabel = `${label}.instructions_files`;
    assertInstructionFilePathList(value.instructions_files, fileLabel);
    rawPaths = value.instructions_files;
  }

  references.push({
    carrier: value,
    label,
    files: rawPaths.map((filePath, index) => ({
      rawPath: filePath,
      resolvedPath: resolveInsideRoot(
        filePath,
        context,
        hasInstructionFile ? fileLabel : `${fileLabel}[${index}]`,
        false,
      ),
    })),
    appendInlineInstructions: hasInstructionFiles,
  });
}

function materializeInstructionFile(
  reference: InstructionFileReference,
  contents: string[],
) {
  const parts = [...contents];
  const inlineInstructions = reference.carrier.instructions;

  if (
    reference.appendInlineInstructions &&
    typeof inlineInstructions === "string" &&
    inlineInstructions.length > 0
  ) {
    parts.push(inlineInstructions);
  }

  reference.carrier.instructions = parts.join("\n\n");
  delete reference.carrier.instructions_file;
  delete reference.carrier.instructions_files;
}

export function loadAgentHarnessDescriptor(
  yaml: string,
  optionsOrPromptMap?:
    | LoadAgentHarnessDescriptorOptions
    | AgentHarnessPromptMap,
): AgentHarnessDescriptor {
  const options = normalizeOptions(optionsOrPromptMap);
  const context = createLoadContext(options);
  const descriptor = parseDescriptorYaml(yaml, context.descriptorLabel);
  const references = collectInstructionFileReferences(descriptor, context);

  if (references.length > 0 && !context.promptMap) {
    throw new Error(
      "loadAgentHarnessDescriptor(...) requires promptMap when the descriptor uses instructions_file or instructions_files. Use loadAgentHarnessDescriptorFromFile(...) to read prompt files from disk.",
    );
  }

  for (const reference of references) {
    const contents = reference.files.map((file) => {
      const content = context.promptMap?.get(file.resolvedPath);
      if (typeof content === "undefined") {
        throw new Error(
          `Missing promptMap entry for ${reference.label} prompt file "${file.rawPath}".`,
        );
      }
      return content;
    });
    materializeInstructionFile(reference, contents);
  }

  return descriptor as AgentHarnessDescriptor;
}

export async function loadAgentHarnessDescriptorFromFile(
  descriptorPath: string,
  options: LoadAgentHarnessDescriptorFromFileOptions = {},
): Promise<AgentHarnessDescriptor> {
  assertNonEmptyString(descriptorPath, "Harness descriptor path");

  const resolvedDescriptorPath = resolve(descriptorPath);
  const descriptorDir = dirname(resolvedDescriptorPath);
  const rootDir = resolve(options.rootDir ?? descriptorDir);
  const context = createLoadContext({
    descriptorPath: resolvedDescriptorPath,
    rootDir,
  });
  assertPathInsideRoot(
    resolvedDescriptorPath,
    rootDir,
    "Harness descriptor path",
  );

  const rootRealPath = await realpath(rootDir);
  const descriptorRealPath = await realpath(resolvedDescriptorPath);
  assertPathInsideRoot(
    descriptorRealPath,
    rootRealPath,
    "Harness descriptor path",
  );

  const yaml = await readFile(descriptorRealPath, "utf8");
  const descriptor = parseDescriptorYaml(yaml, descriptorRealPath);
  const references = collectInstructionFileReferences(descriptor, context);

  for (const reference of references) {
    const contents: string[] = [];
    for (const file of reference.files) {
      const promptRealPath = await realpath(file.resolvedPath);
      assertPathInsideRoot(
        promptRealPath,
        rootRealPath,
        `${reference.label} prompt file`,
      );
      contents.push(await readFile(promptRealPath, "utf8"));
    }
    materializeInstructionFile(reference, contents);
  }

  return descriptor as AgentHarnessDescriptor;
}
