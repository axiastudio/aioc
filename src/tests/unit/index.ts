import { runHandoffUnitTests } from "./handoff.unit";
import { runGuardrailUnitTests } from "./guardrail.unit";
import { runJsonUnitTests } from "./json.unit";
import { runLoggerUnitTests } from "./logger.unit";
import { runPolicyUnitTests } from "./policy.unit";
import { runProviderSetupUnitTests } from "./provider-setup.unit";
import { runRunRecordUnitTests } from "./run-record.unit";
import { runRunUnitTests } from "./run.unit";

async function main(): Promise<void> {
  await runRunUnitTests();
  await runRunRecordUnitTests();
  await runLoggerUnitTests();
  await runJsonUnitTests();
  await runProviderSetupUnitTests();
  await runPolicyUnitTests();
  await runHandoffUnitTests();
  await runGuardrailUnitTests();
  process.stdout.write("Unit tests passed.\n");
}

main().catch((error) => {
  const message =
    error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
