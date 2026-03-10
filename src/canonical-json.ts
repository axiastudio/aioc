import { createHash } from "node:crypto";

export type CanonicalJsonValue =
  | null
  | string
  | number
  | boolean
  | CanonicalJsonValue[]
  | { [key: string]: CanonicalJsonValue };

export function normalizeCanonicalJsonValue(
  value: unknown,
  seen: WeakSet<object> = new WeakSet(),
): CanonicalJsonValue {
  if (value === null) {
    return null;
  }

  const valueType = typeof value;
  if (
    valueType === "string" ||
    valueType === "number" ||
    valueType === "boolean"
  ) {
    return value as string | number | boolean;
  }

  if (valueType === "undefined") {
    return "[undefined]";
  }

  if (valueType === "bigint") {
    return `[bigint:${String(value)}]`;
  }

  if (valueType === "symbol") {
    return `[symbol:${String(value)}]`;
  }

  if (valueType === "function") {
    return "[function]";
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value instanceof RegExp) {
    return value.toString();
  }

  if (Array.isArray(value)) {
    return value.map((entry) => normalizeCanonicalJsonValue(entry, seen));
  }

  if (value instanceof Set) {
    const entries = [...value].map((entry) =>
      normalizeCanonicalJsonValue(entry, seen),
    );
    entries.sort((left, right) =>
      JSON.stringify(left).localeCompare(JSON.stringify(right)),
    );
    return entries;
  }

  if (value instanceof Map) {
    const entries = [...value.entries()].map(([key, entry]) => [
      normalizeCanonicalJsonValue(key, seen),
      normalizeCanonicalJsonValue(entry, seen),
    ]);
    entries.sort((left, right) =>
      JSON.stringify(left[0]).localeCompare(JSON.stringify(right[0])),
    );
    return entries as CanonicalJsonValue;
  }

  if (value && typeof value === "object") {
    const objectValue = value as Record<string, unknown>;
    if (seen.has(objectValue)) {
      return "[circular]";
    }
    seen.add(objectValue);

    const normalized: Record<string, CanonicalJsonValue> = {};
    const keys = Object.keys(objectValue).sort();
    for (const key of keys) {
      normalized[key] = normalizeCanonicalJsonValue(objectValue[key], seen);
    }

    seen.delete(objectValue);
    return normalized;
  }

  return String(value);
}

export function toCanonicalJson(value: unknown): string {
  return JSON.stringify(normalizeCanonicalJsonValue(value));
}

export function hashCanonicalJson(canonicalJson: string): string {
  return createHash("sha256").update(canonicalJson).digest("hex");
}

export function hashCanonicalJsonValue(value: unknown): string {
  return hashCanonicalJson(toCanonicalJson(value));
}
