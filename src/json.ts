export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];

export interface JsonObject {
  [key: string]: JsonValue;
}

function createJsonReplacer(): (key: string, value: unknown) => unknown {
  const seen = new WeakSet<object>();

  return (_key: string, value: unknown): unknown => {
    if (typeof value === "bigint") {
      return value.toString();
    }
    if (typeof value === "function" || typeof value === "symbol") {
      return null;
    }
    if (value instanceof Map) {
      return Object.fromEntries(value.entries());
    }
    if (value instanceof Set) {
      return Array.from(value.values());
    }
    if (value instanceof Error) {
      return {
        name: value.name,
        message: value.message,
      };
    }

    if (value && typeof value === "object") {
      if (seen.has(value)) {
        return "[Circular]";
      }
      seen.add(value);
    }
    return value;
  };
}

export function toJsonValue(value: unknown): JsonValue {
  const serialized = JSON.stringify(value, createJsonReplacer());
  if (typeof serialized === "undefined") {
    return null;
  }
  return JSON.parse(serialized) as JsonValue;
}
