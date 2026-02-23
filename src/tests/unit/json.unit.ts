import assert from "node:assert/strict";
import { toJsonValue } from "../../json";

export async function runJsonUnitTests(): Promise<void> {
  {
    const input = {
      value: 42,
      nested: {
        allow: true,
      },
    };
    assert.deepEqual(toJsonValue(input), input);
  }

  {
    const value = {
      big: 10n,
      fn: () => "x",
      symbol: Symbol("s"),
      map: new Map<string, unknown>([
        ["k1", "v1"],
        ["k2", 2],
      ]),
      set: new Set(["a", "b"]),
      err: new Error("boom"),
      arr: [1, undefined, "x"],
      undef: undefined,
    };

    assert.deepEqual(toJsonValue(value), {
      big: "10",
      fn: null,
      symbol: null,
      map: {
        k1: "v1",
        k2: 2,
      },
      set: ["a", "b"],
      err: {
        name: "Error",
        message: "boom",
      },
      arr: [1, null, "x"],
    });
  }

  {
    const circular: Record<string, unknown> = { id: "a" };
    circular.self = circular;

    assert.deepEqual(toJsonValue(circular), {
      id: "a",
      self: "[Circular]",
    });
  }

  {
    assert.equal(toJsonValue(undefined), null);
    assert.equal(toJsonValue(Symbol("x")), null);
  }
}
