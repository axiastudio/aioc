import { runAuditTrailConsistencyRegressionTests } from "./audit-trail-consistency.regression";
import { runHandoffTransitionRegressionTests } from "./handoff-transition.regression";
import { runPolicyDefaultDenyRegressionTests } from "./policy-default-deny.regression";
import { runPrivacyBaselineRegressionTests } from "./privacy-baseline.regression";

async function main(): Promise<void> {
  await runAuditTrailConsistencyRegressionTests();
  await runPolicyDefaultDenyRegressionTests();
  await runHandoffTransitionRegressionTests();
  await runPrivacyBaselineRegressionTests();
  process.stdout.write("Regression tests passed.\n");
}

main().catch((error) => {
  const message =
    error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
