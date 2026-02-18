import { runGuardrailUnitTests } from "./guardrail.unit";
import { runPolicyUnitTests } from "./policy.unit";
import { runRunUnitTests } from "./run.unit";

async function main(): Promise<void> {
  await runRunUnitTests();
  await runPolicyUnitTests();
  await runGuardrailUnitTests();
  process.stdout.write("Unit tests passed.\n");
}

main().catch((error) => {
  const message =
    error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
