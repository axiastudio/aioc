import { runPolicyDefaultDenyRegressionTests } from "./policy-default-deny.regression";

async function main(): Promise<void> {
  await runPolicyDefaultDenyRegressionTests();
  process.stdout.write("Regression tests passed.\n");
}

main().catch((error) => {
  const message =
    error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
