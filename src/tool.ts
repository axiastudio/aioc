import { z } from "zod";
import { RunContext } from "./run-context";

export interface Tool<TContext = unknown, TOutput = unknown> {
  name: string;
  description: string;
  parameters: z.ZodTypeAny;
  execute: (
    input: unknown,
    runContext?: RunContext<TContext>,
  ) => Promise<TOutput> | TOutput;
}

export type ToolConfig<
  TContext = unknown,
  TSchema extends z.ZodTypeAny = z.ZodTypeAny,
  TOutput = unknown,
> = {
  name: string;
  description: string;
  parameters: TSchema;
  execute: (
    input: z.infer<TSchema>,
    runContext?: RunContext<TContext>,
  ) => Promise<TOutput> | TOutput;
};

export function tool<
  TContext = unknown,
  TSchema extends z.ZodTypeAny = z.ZodTypeAny,
  TOutput = unknown,
>(config: ToolConfig<TContext, TSchema, TOutput>): Tool<TContext, TOutput> {
  return config as Tool<TContext, TOutput>;
}
