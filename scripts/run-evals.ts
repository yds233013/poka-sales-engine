/**
 * Evaluation CLI.
 *
 *   npm run eval
 *   npm run eval -- --mode DETERMINISTIC
 *   npm run eval -- --scenario hero-substitution
 *
 * Prints a table and exits non-zero if any scenario that actually ran failed,
 * so it is usable as a gate. A NOT_RUN adaptive scenario is not a failure —
 * it is an absence of evidence, and the output says so.
 */

import { PrismaClient } from "../src/generated/prisma";
import { EVAL_SCENARIOS, scenarioById } from "../src/lib/eval/scenario";
import { runScenario, type EvalMode, type EvalResult } from "../src/lib/eval/runner";
import { isAdaptiveAvailable } from "../src/lib/ai/capability";

const prisma = new PrismaClient();

function arg(flag: string): string | null {
  const index = process.argv.indexOf(flag);
  return index !== -1 ? (process.argv[index + 1] ?? null) : null;
}

function pad(value: string, width: number): string {
  return value.length > width ? `${value.slice(0, width - 1)}…` : value.padEnd(width);
}

function line(result: EvalResult): string {
  const status =
    result.status === "PASS"
      ? "PASS "
      : result.status === "NOT_RUN"
        ? "  -  "
        : result.status === "EXPECTED_GAP"
          ? " gap "
          : result.status.slice(0, 5);
  const tools =
    result.status === "NOT_RUN"
      ? "—"
      : result.mode === "ADAPTIVE_AGENT"
        ? `${result.metrics.modelInitiatedCalls}/${result.metrics.toolCalls}`
        : String(result.metrics.toolCalls);
  const ground =
    result.mode !== "ADAPTIVE_AGENT" || result.status === "NOT_RUN"
      ? "—"
      : result.metrics.groundingIssues === 0
        ? "ok"
        : String(result.metrics.groundingIssues);
  return `  ${status} ${pad(result.mode === "ADAPTIVE_AGENT" ? "adaptive" : "deterministic", 14)} ${pad(
    result.outcome ?? "—",
    21,
  )} ${pad(result.selectedSku ?? "—", 10)} ${pad(tools, 7)} ${pad(String(result.metrics.unnecessaryCalls || "0"), 9)} ${pad(
    ground,
    8,
  )} ${pad(String(result.metrics.safetyViolations), 7)}`;
}

async function main() {
  const modeArg = arg("--mode");
  const scenarioArg = arg("--scenario");

  const modes: EvalMode[] = modeArg
    ? [modeArg.toUpperCase() as EvalMode]
    : ["DETERMINISTIC", "ADAPTIVE_AGENT"];
  const scenarios = scenarioArg
    ? [scenarioById(scenarioArg)].filter((s): s is NonNullable<typeof s> => Boolean(s))
    : EVAL_SCENARIOS;

  if (scenarios.length === 0) {
    console.error(`No scenario matched "${scenarioArg}".`);
    process.exit(1);
  }

  console.log(`\nPoka Sales Engine — evaluation`);
  console.log(`  ${scenarios.length} scenario(s) × ${modes.length} mode(s)`);
  console.log(
    `  adaptive mode: ${isAdaptiveAvailable() ? "available" : "UNAVAILABLE (no ANTHROPIC_API_KEY) — adaptive rows will report NOT RUN"}\n`,
  );
  console.log(
    `  ${pad("STATUS", 5)} ${pad("MODE", 14)} ${pad("OUTCOME", 21)} ${pad("SKU", 10)} ${pad("TOOLS", 7)} ${pad("UNNEEDED", 9)} ${pad("GROUND", 8)} ${pad("SAFETY", 7)}`,
  );
  console.log(`  ${"─".repeat(92)}`);

  let ran = 0;
  let passed = 0;
  let failed = 0;
  let notRun = 0;
  let expectedGaps = 0;
  const failures: { scenario: string; mode: string; detail: string }[] = [];
  const gaps: { scenario: string; reason: string }[] = [];

  for (const scenario of scenarios) {
    console.log(`\n  ${scenario.title}`);
    for (const mode of modes) {
      const result = await runScenario(prisma, scenario, mode);
      console.log(line(result));
      if (result.status === "NOT_RUN") {
        notRun += 1;
        continue;
      }
      ran += 1;
      if (result.status === "PASS") {
        passed += 1;
      } else if (result.status === "EXPECTED_GAP") {
        // A declared limitation of the fixed pipeline. Reported, never hidden,
        // but it does not fail the gate — it is the measurement.
        expectedGaps += 1;
        gaps.push({ scenario: scenario.id, reason: result.expectedGapReason ?? "" });
      } else {
        failed += 1;
        for (const check of result.checks.filter((c) => !c.passed)) {
          failures.push({ scenario: scenario.id, mode, detail: `${check.name}: ${check.detail}` });
        }
        if (result.error) failures.push({ scenario: scenario.id, mode, detail: result.error });
      }
    }
  }

  console.log(`\n  ${"─".repeat(92)}`);
  const parts = [`${passed}/${ran} passed`];
  if (expectedGaps > 0) parts.push(`${expectedGaps} expected baseline gap(s)`);
  if (failed > 0) parts.push(`${failed} failed`);
  if (notRun > 0) parts.push(`${notRun} not run (no provider configured)`);
  console.log(`  ${parts.join(", ")}\n`);

  if (gaps.length > 0) {
    console.log("  Expected baseline gaps — scenarios the fixed pipeline cannot work:");
    for (const gap of gaps) console.log(`    ${gap.scenario} — ${gap.reason}`);
    console.log("");
  }

  if (failures.length > 0) {
    console.log("  Failures:");
    for (const failure of failures) {
      console.log(`    ${failure.scenario} [${failure.mode.toLowerCase()}] — ${failure.detail}`);
    }
    console.log("");
  }

  process.exitCode = failed > 0 ? 1 : 0;
}

main()
  .catch((error) => {
    console.error("\nEvaluation failed to run:\n", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
