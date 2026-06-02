import { load as loadYaml } from "js-yaml";
import type {
  AgentHarnessDescriptor,
  HarnessAgentDescriptor,
  HarnessInstructionPartDescriptor,
  HarnessInstructionWhereDescriptor,
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

interface HarnessInstructionFileSourceDescriptor {
  file: string;
  where?: HarnessInstructionWhereDescriptor;
}

interface HarnessInstructionRefSourceDescriptor {
  ref: string;
  where?: HarnessInstructionWhereDescriptor;
}

interface HarnessInstructionTextSourceDescriptor {
  text: string;
  where?: HarnessInstructionWhereDescriptor;
}

type HarnessInstructionSourceDescriptor =
  | HarnessInstructionFileSourceDescriptor
  | HarnessInstructionRefSourceDescriptor
  | HarnessInstructionTextSourceDescriptor;

type HarnessAgentInstructionsInput =
  | {
      instructions?: string | HarnessInstructionPartDescriptor[];
      instructions_file?: never;
      instructions_files?: never;
      instructions_sequence?: never;
    }
  | {
      instructions_file: string;
      instructions?: never;
      instructions_files?: never;
      instructions_sequence?: never;
    }
  | {
      instructions_files: string[];
      instructions?: string;
      instructions_file?: never;
      instructions_sequence?: never;
    }
  | {
      instructions_sequence: HarnessInstructionSourceDescriptor[];
      instructions?: never;
      instructions_file?: never;
      instructions_files?: never;
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

type ResolvedInstructionSequenceItem =
  | {
      kind: "file";
      file: ResolvedPromptFile;
      where?: HarnessInstructionWhereDescriptor;
    }
  | {
      kind: "ref";
      text: string;
      where?: HarnessInstructionWhereDescriptor;
    }
  | {
      kind: "text";
      text: string;
      where?: HarnessInstructionWhereDescriptor;
    };

interface InstructionSequenceReference {
  target: Record<string, unknown>;
  label: string;
  items: ResolvedInstructionSequenceItem[];
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

function collectInstructionSequenceReferences(
  descriptor: AgentHarnessDescriptorInput,
  context: DescriptorPathContext,
): InstructionSequenceReference[] {
  const references: InstructionSequenceReference[] = [];

  const defaultReference = createInstructionSequenceReference(
    descriptor.agent_defaults,
    "Harness descriptor agent_defaults",
    descriptor,
    context,
  );
  if (defaultReference) {
    references.push(defaultReference);
  }

  if (!isPlainObject(descriptor.agents)) {
    return references;
  }

  for (const [agentId, agentDescriptor] of Object.entries(descriptor.agents)) {
    const agentReference = createInstructionSequenceReference(
      agentDescriptor,
      `Harness descriptor agent "${agentId}"`,
      descriptor,
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

function createInstructionSequenceReference(
  value: unknown,
  label: string,
  descriptor: AgentHarnessDescriptorInput,
  context: DescriptorPathContext,
): InstructionSequenceReference | undefined {
  if (!isPlainObject(value) || !hasDefined(value, "instructions_sequence")) {
    return undefined;
  }

  assertInstructionSequenceFields(value, label);
  const rawItems = value.instructions_sequence;
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    throw new Error(
      `${label}.instructions_sequence must be a non-empty array.`,
    );
  }

  return {
    target: value,
    label,
    items: rawItems.map((item, index) =>
      readInstructionSequenceItem(
        item,
        `${label}.instructions_sequence[${index}]`,
        descriptor,
        context,
      ),
    ),
  };
}

function assertInstructionSequenceFields(
  value: Record<string, unknown>,
  label: string,
) {
  for (const field of [
    "instructions",
    "instructions_file",
    "instructions_files",
  ]) {
    if (hasDefined(value, field)) {
      throw new Error(
        `${label}.instructions_sequence is mutually exclusive with ${label}.${field}.`,
      );
    }
  }
}

function readInstructionSequenceItem(
  value: unknown,
  label: string,
  descriptor: AgentHarnessDescriptorInput,
  context: DescriptorPathContext,
): ResolvedInstructionSequenceItem {
  if (!isPlainObject(value)) {
    throw new Error(`${label} must be an object.`);
  }

  const hasFile = hasDefined(value, "file");
  const hasRef = hasDefined(value, "ref");
  const hasText = hasDefined(value, "text");
  const definedKinds = [hasFile, hasRef, hasText].filter(Boolean).length;
  if (definedKinds !== 1) {
    throw new Error(`${label} must define exactly one of file, ref, or text.`);
  }

  const where = readInstructionWhere(value.where, label);
  if (hasFile) {
    const fileLabel = `${label}.file`;
    assertPromptFilePath(value.file, fileLabel);
    return {
      kind: "file",
      file: resolvePromptFilePath(value.file, context, fileLabel),
      ...(where ? { where } : {}),
    };
  }

  if (hasRef) {
    const refLabel = `${label}.ref`;
    const ref = readNonEmptyString(value.ref, refLabel);
    return {
      kind: "ref",
      text: resolveInstructionPartReference(descriptor, ref, refLabel),
      ...(where ? { where } : {}),
    };
  }

  return {
    kind: "text",
    text: readString(value.text, `${label}.text`),
    ...(where ? { where } : {}),
  };
}

function readInstructionWhere(
  value: unknown,
  label: string,
): HarnessInstructionWhereDescriptor | undefined {
  if (typeof value === "undefined") {
    return undefined;
  }
  if (!isPlainObject(value)) {
    throw new Error(`${label}.where must be an object.`);
  }
  return {
    context: readNonEmptyString(value.context, `${label}.where.context`),
  };
}

function readString(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw new Error(`${label} must be a string.`);
  }
  return value;
}

function readNonEmptyString(value: unknown, label: string): string {
  const text = readString(value, label);
  if (text.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return text;
}

function resolveInstructionPartReference(
  descriptor: AgentHarnessDescriptorInput,
  ref: string,
  label: string,
): string {
  const catalog = descriptor.instruction_parts;
  if (!isPlainObject(catalog)) {
    throw new Error(
      `${label} references instruction part "${ref}", but descriptor.instruction_parts is not defined.`,
    );
  }

  if (!(ref in catalog)) {
    throw new Error(`${label} references unknown instruction part "${ref}".`);
  }

  return readString(catalog[ref], `descriptor.instruction_parts.${ref}`);
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
    hasInstructionSequence: hasDefined(value, "instructions_sequence"),
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
    hasInstructionSequence: boolean;
  },
) {
  const { hasInstructionFile, hasInstructionFiles, hasInstructionSequence } =
    fields;

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

  if (hasInstructionSequence && (hasInstructionFile || hasInstructionFiles)) {
    throw new Error(
      `${label}.instructions_sequence is mutually exclusive with ${label}.instructions_file/instructions_files.`,
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

function sequenceRequiresPromptFiles(
  reference: InstructionSequenceReference,
): boolean {
  return reference.items.some((item) => item.kind === "file");
}

function materializeInstructionSequenceReference(
  reference: InstructionSequenceReference,
  contents: string[],
) {
  let fileContentIndex = 0;
  const parts: HarnessInstructionPartDescriptor[] = reference.items.map(
    (item) => {
      const text =
        item.kind === "file" ? contents[fileContentIndex++] : item.text;
      return {
        text: text ?? "",
        ...(item.where ? { where: item.where } : {}),
      };
    },
  );

  reference.target.instructions = parts;
  delete reference.target.instructions_sequence;
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

function readPromptMapSequenceContents(
  reference: InstructionSequenceReference,
  promptMap: Map<string, string>,
): string[] {
  return reference.items
    .filter(
      (
        item,
      ): item is Extract<ResolvedInstructionSequenceItem, { kind: "file" }> =>
        item.kind === "file",
    )
    .map((item) => {
      const content = promptMap.get(item.file.resolvedPath);
      if (typeof content === "undefined") {
        throw new Error(
          `Missing promptMap entry for ${reference.label} prompt file "${item.file.rawPath}".`,
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
  const sequenceReferences = collectInstructionSequenceReferences(
    descriptor,
    context,
  );
  const hasPromptFileReferences =
    references.length > 0 ||
    sequenceReferences.some((reference) =>
      sequenceRequiresPromptFiles(reference),
    );

  if (hasPromptFileReferences && !promptMap) {
    throw new Error(
      "loadAgentHarnessDescriptor(...) requires promptMap when the descriptor uses instructions_file, instructions_files, or instructions_sequence file items. Use loadAgentHarnessDescriptorFromFile(...) to read prompt files from disk.",
    );
  }

  if (promptMap) {
    for (const reference of references) {
      const contents = readPromptMapContents(reference, promptMap);
      materializeInstructionReference(reference, contents);
    }
  }

  for (const reference of sequenceReferences) {
    const contents = promptMap
      ? readPromptMapSequenceContents(reference, promptMap)
      : [];
    materializeInstructionSequenceReference(reference, contents);
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
  const sequenceReferences = collectInstructionSequenceReferences(
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

  for (const reference of sequenceReferences) {
    const files = reference.items
      .filter(
        (
          item,
        ): item is Extract<ResolvedInstructionSequenceItem, { kind: "file" }> =>
          item.kind === "file",
      )
      .map((item) => item.file);
    const contents =
      files.length > 0
        ? await readResolvedPromptFiles(
            files,
            reference.label,
            loaded.rootRealPath,
          )
        : [];
    materializeInstructionSequenceReference(reference, contents);
  }

  return descriptor as AgentHarnessDescriptor;
}
