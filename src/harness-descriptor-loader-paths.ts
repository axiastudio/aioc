import { readFile, realpath } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

export interface DescriptorPathContext {
  descriptorDir: string;
  descriptorLabel: string;
  rootDir: string;
}

export interface ResolvedPromptFile {
  rawPath: string;
  resolvedPath: string;
}

export interface LoadedDescriptorFile {
  context: DescriptorPathContext;
  descriptorLabel: string;
  rootRealPath: string;
  yaml: string;
}

const URL_LIKE_PATH = /^[A-Za-z][A-Za-z0-9+.-]*:\/\//;
const GLOB_LIKE_PATH = /[*?[\]{}]/;

export function assertNonEmptyString(
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

function assertSafePath(
  value: unknown,
  label: string,
  options: { allowAbsolute: boolean },
): asserts value is string {
  assertNonEmptyString(value, label);

  if (value.includes("\0")) {
    throw new Error(`${label} must not contain null bytes.`);
  }
  if (URL_LIKE_PATH.test(value)) {
    throw new Error(`${label} must not be a remote URL.`);
  }
  if (!options.allowAbsolute && isAbsolute(value)) {
    throw new Error(`${label} must be relative to the descriptor file.`);
  }
  if (GLOB_LIKE_PATH.test(value)) {
    throw new Error(`${label} must not use globbing characters.`);
  }
}

export function assertPromptFilePath(
  value: unknown,
  label: string,
): asserts value is string {
  assertSafePath(value, label, { allowAbsolute: false });
}

export function assertPromptFilePathList(
  value: unknown,
  label: string,
): asserts value is string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${label} must be a non-empty array of strings.`);
  }

  for (const [index, path] of value.entries()) {
    assertPromptFilePath(path, `${label}[${index}]`);
  }
}

function resolveInsideRoot(
  rawPath: string,
  context: DescriptorPathContext,
  label: string,
  options: { allowAbsolute: boolean },
): string {
  assertSafePath(rawPath, label, options);

  const resolvedPath = isAbsolute(rawPath)
    ? resolve(rawPath)
    : resolve(context.descriptorDir, rawPath);
  assertPathInsideRoot(resolvedPath, context.rootDir, label);
  return resolvedPath;
}

export function resolvePromptFilePath(
  rawPath: string,
  context: DescriptorPathContext,
  label: string,
): ResolvedPromptFile {
  return {
    rawPath,
    resolvedPath: resolveInsideRoot(rawPath, context, label, {
      allowAbsolute: false,
    }),
  };
}

export function createPathContext(options: {
  descriptorPath?: string;
  rootDir?: string;
}): DescriptorPathContext {
  const descriptorPath = options.descriptorPath
    ? resolve(options.descriptorPath)
    : undefined;
  const descriptorDir = descriptorPath
    ? dirname(descriptorPath)
    : resolve(options.rootDir ?? process.cwd());
  const rootDir = resolve(options.rootDir ?? descriptorDir);
  return {
    descriptorDir,
    descriptorLabel: descriptorPath ?? "<inline descriptor>",
    rootDir,
  };
}

export function createPromptMap(
  promptMap: Record<string, string>,
  context: DescriptorPathContext,
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
      { allowAbsolute: true },
    );
    normalized.set(resolvedPath, content);
  }

  return normalized;
}

export async function loadDescriptorFile(
  descriptorPath: string,
  options: { rootDir?: string } = {},
): Promise<LoadedDescriptorFile> {
  assertNonEmptyString(descriptorPath, "Harness descriptor path");

  const resolvedDescriptorPath = resolve(descriptorPath);
  const descriptorDir = dirname(resolvedDescriptorPath);
  const rootDir = resolve(options.rootDir ?? descriptorDir);
  const context = createPathContext({
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

  return {
    context,
    descriptorLabel: descriptorRealPath,
    rootRealPath,
    yaml: await readFile(descriptorRealPath, "utf8"),
  };
}

export async function readResolvedPromptFiles(
  files: ResolvedPromptFile[],
  label: string,
  rootRealPath: string,
): Promise<string[]> {
  const contents: string[] = [];

  for (const file of files) {
    const promptRealPath = await realpath(file.resolvedPath);
    assertPathInsideRoot(promptRealPath, rootRealPath, `${label} prompt file`);
    contents.push(await readFile(promptRealPath, "utf8"));
  }

  return contents;
}
