/**
 * Compatibility engine.
 *
 * Evaluates a candidate product against the requirements extracted from a
 * customer request, one declarative rule at a time. The rules live in the
 * database so an application engineer could add a dimension without a code
 * change.
 *
 * Two invariants this file exists to guarantee:
 *
 *   1. A HARD rule failure classifies the candidate BLOCKED. Nothing
 *      downstream is permitted to quote, price or recommend a BLOCKED
 *      candidate — `assertNotBlocked` is called on the path to every quote.
 *   2. A missing spec is UNKNOWN, never PASS. Silently treating absent data
 *      as satisfactory is exactly how an unsafe substitution reaches a
 *      customer, so unknowns force human review instead.
 */

import type {
  CheckOutcome,
  CheckResult,
  CompatibilityRuleView,
  CompatibilityVerdict,
  ProductView,
  RequirementView,
  RuleOperator,
  SpecValue,
} from "@/lib/domain/types";

function renderSpec(spec: SpecValue | undefined): string {
  if (!spec) return "not published";
  if (spec.type === "NUMERIC" && spec.numValue != null) {
    return `${trimNum(spec.numValue)}${spec.unit ? ` ${spec.unit}` : ""}`;
  }
  if (spec.type === "RANGE") {
    const lo = spec.minValue != null ? trimNum(spec.minValue) : "—";
    const hi = spec.maxValue != null ? trimNum(spec.maxValue) : "—";
    return `${lo} to ${hi}${spec.unit ? ` ${spec.unit}` : ""}`;
  }
  if (spec.type === "BOOLEAN") return spec.boolValue ? "yes" : "no";
  return spec.textValue ?? "not published";
}

function renderRequirement(req: RequirementView): string {
  const op =
    req.operator === "GTE"
      ? "at least "
      : req.operator === "LTE"
        ? "at most "
        : req.operator === "NEQ"
          ? "not "
          : "";
  if (req.numValue != null) {
    return `${op}${trimNum(req.numValue)}${req.unit ? ` ${req.unit}` : ""}`;
  }
  return `${op}${req.textValue ?? "—"}`;
}

function trimNum(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(3)));
}

/** Normalises connection/material strings so "DN50 / 2in" matches "2 in". */
export function normalizeToken(value: string): string {
  return value
    .toLowerCase()
    .replace(/ /g, " ")
    .replace(/["']/g, "in")
    .replace(/[^a-z0-9.]+/g, " ")
    .trim();
}

function tokenSet(value: string): Set<string> {
  return new Set(
    normalizeToken(value)
      .split(" ")
      .filter((t) => t.length > 0),
  );
}

/** True when every token of `needle` appears in `haystack`. */
function tokensContain(haystack: string, needle: string): boolean {
  const hay = tokenSet(haystack);
  const need = tokenSet(needle);
  if (need.size === 0) return false;
  for (const token of need) if (!hay.has(token)) return false;
  return true;
}

function numericSpecValue(spec: SpecValue, operator: RuleOperator): number | null {
  if (spec.numValue != null) return spec.numValue;
  // For a range spec, compare against the end that matters for the operator:
  // a GTE requirement ("must reach 180 °C") tests the range maximum.
  if (spec.type === "RANGE") {
    if (operator === "GTE") return spec.maxValue ?? null;
    if (operator === "LTE") return spec.minValue ?? null;
  }
  return null;
}

function evaluateRule(
  rule: CompatibilityRuleView,
  requirement: RequirementView,
  product: ProductView,
): CheckOutcome {
  const spec = product.specs[rule.specKey];
  const base = {
    dimension: rule.dimension,
    label: rule.label,
    severity: rule.severity,
    requirement: renderRequirement(requirement),
    actual: renderSpec(spec),
    ruleCode: rule.code,
    specKey: rule.specKey,
  };

  if (!spec) {
    return {
      ...base,
      result: "UNKNOWN" as CheckResult,
      detail: `${product.sku} does not publish a ${rule.label.toLowerCase()} value, so this requirement cannot be verified from catalog data.`,
    };
  }

  // Text / enum comparisons.
  if (rule.operator === "INCLUDES" || rule.operator === "EQ" || rule.operator === "NEQ") {
    const actualText =
      spec.textValue ?? (spec.boolValue != null ? (spec.boolValue ? "yes" : "no") : null);
    const wantedText = requirement.textValue;
    if (actualText == null || wantedText == null) {
      return {
        ...base,
        result: "UNKNOWN",
        detail: `Could not compare ${rule.label.toLowerCase()}: one side has no comparable value.`,
      };
    }
    const contains = tokensContain(actualText, wantedText);
    const equal = normalizeToken(actualText) === normalizeToken(wantedText);
    let ok: boolean;
    if (rule.operator === "INCLUDES") ok = contains;
    else if (rule.operator === "EQ") ok = equal || contains;
    else ok = !equal && !contains;

    return {
      ...base,
      result: ok ? "PASS" : rule.severity === "HARD" ? "FAIL" : "WARNING",
      detail: ok
        ? `${product.sku} ${rule.label.toLowerCase()} is "${actualText}", which satisfies "${wantedText}".`
        : `${product.sku} ${rule.label.toLowerCase()} is "${actualText}" but the request needs "${wantedText}". ${rule.explanation}`,
    };
  }

  // Numeric comparisons.
  const actual = numericSpecValue(spec, rule.operator);
  const wanted = requirement.numValue;
  if (actual == null || wanted == null) {
    return {
      ...base,
      result: "UNKNOWN",
      detail: `Could not compare ${rule.label.toLowerCase()} numerically — a value is missing.`,
    };
  }

  let ok: boolean;
  let detailSuffix = "";
  if (rule.operator === "GTE") {
    ok = actual >= wanted;
    detailSuffix = ok
      ? `${trimNum(actual)} ≥ ${trimNum(wanted)}${spec.unit ? ` ${spec.unit}` : ""}`
      : `${trimNum(actual)} < ${trimNum(wanted)}${spec.unit ? ` ${spec.unit}` : ""}`;
  } else if (rule.operator === "LTE") {
    ok = actual <= wanted;
    detailSuffix = ok
      ? `${trimNum(actual)} ≤ ${trimNum(wanted)}${spec.unit ? ` ${spec.unit}` : ""}`
      : `${trimNum(actual)} > ${trimNum(wanted)}${spec.unit ? ` ${spec.unit}` : ""}`;
  } else {
    // WITHIN_TOLERANCE
    const tol = rule.tolerancePct ?? 10;
    const delta = wanted === 0 ? 0 : Math.abs((actual - wanted) / wanted) * 100;
    ok = delta <= tol;
    detailSuffix = `deviation ${delta.toFixed(1)}% against a ${tol}% tolerance`;
  }

  return {
    ...base,
    result: ok ? "PASS" : rule.severity === "HARD" ? "FAIL" : "WARNING",
    detail: ok
      ? `${product.sku} ${rule.label.toLowerCase()} satisfies the requirement (${detailSuffix}).`
      : `${product.sku} ${rule.label.toLowerCase()} does not satisfy the requirement (${detailSuffix}). ${rule.explanation}`,
  };
}

/**
 * Evaluate one candidate product against all applicable requirements.
 *
 * Returns every check performed — including the ones that passed — because
 * the UI shows the full matrix. An operator who can only see failures cannot
 * tell the difference between "checked and fine" and "never checked".
 */
export function evaluateCandidate(
  product: ProductView,
  requirements: RequirementView[],
  rules: CompatibilityRuleView[],
): CompatibilityVerdict {
  const checks: CheckOutcome[] = [];
  const seenDimensions = new Set<string>();

  for (const rule of rules) {
    if (rule.appliesTo.length > 0 && !rule.appliesTo.includes(product.categoryCode)) continue;

    const requirement = requirements.find(
      (r) => r.key === rule.requirementKey && r.kind !== "MISSING",
    );

    if (!requirement) {
      // No requirement on this dimension — genuinely not applicable.
      continue;
    }

    if (requirement.kind === "AMBIGUOUS") {
      checks.push({
        dimension: rule.dimension,
        label: rule.label,
        result: "UNKNOWN",
        severity: rule.severity,
        requirement: renderRequirement(requirement),
        actual: renderSpec(product.specs[rule.specKey]),
        detail: `The request is ambiguous on ${rule.label.toLowerCase()} (${requirement.note ?? "no precise value given"}). This needs clarification before the check can be trusted.`,
        ruleCode: rule.code,
        specKey: rule.specKey,
      });
      seenDimensions.add(rule.dimension);
      continue;
    }

    checks.push(evaluateRule(rule, requirement, product));
    seenDimensions.add(rule.dimension);
  }

  {
    if (product.lifecycle === "END_OF_LIFE" || product.lifecycle === "DISCONTINUED") {
      checks.push({
        dimension: "lifecycle",
        label: "Lifecycle",
        result: product.lifecycle === "DISCONTINUED" ? "FAIL" : "WARNING",
        severity: product.lifecycle === "DISCONTINUED" ? "HARD" : "SOFT",
        requirement: "orderable product",
        actual: product.lifecycle === "DISCONTINUED" ? "discontinued" : "end of life",
        detail:
          product.lifecycle === "DISCONTINUED"
            ? `${product.sku} is discontinued and cannot be supplied.`
            : `${product.sku} is end-of-life. It can still be supplied from stock, but long-term spares support is limited.`,
        ruleCode: "LIFECYCLE",
      });
    }
  }

  const hardFailures = checks.filter((c) => c.result === "FAIL" && c.severity === "HARD");
  const warnings = checks.filter((c) => c.result === "WARNING");
  const unknowns = checks.filter((c) => c.result === "UNKNOWN");
  const softFailures = checks.filter((c) => c.result === "FAIL" && c.severity === "SOFT");

  const safety =
    hardFailures.length > 0
      ? "BLOCKED"
      : warnings.length > 0 || unknowns.length > 0 || softFailures.length > 0
        ? "NEEDS_REVIEW"
        : "AUTO_SAFE";

  // Ordering score for viable candidates. Deliberately crude — it only breaks
  // ties among candidates that already passed every hard rule.
  const passes = checks.filter((c) => c.result === "PASS").length;
  const score =
    hardFailures.length > 0
      ? 0
      : Math.max(
          0,
          Math.round(
            (100 * passes) / Math.max(1, checks.length) -
              warnings.length * 12 -
              unknowns.length * 18 -
              softFailures.length * 12,
          ),
        );

  return {
    productId: product.id,
    sku: product.sku,
    safety,
    checks,
    hardFailures,
    warnings,
    unknowns,
    score,
  };
}

/**
 * Guard used on every path that could put a product in front of a customer.
 * Throws rather than returning a flag so a missed check cannot be ignored.
 */
export function recomputeVerdict(
  verdict: CompatibilityVerdict,
  scorePenalty = 0,
): CompatibilityVerdict {
  const checks = verdict.checks;
  const hardFailures = checks.filter((c) => c.result === "FAIL" && c.severity === "HARD");
  const warnings = checks.filter((c) => c.result === "WARNING");
  const unknowns = checks.filter((c) => c.result === "UNKNOWN");
  const softFailures = checks.filter((c) => c.result === "FAIL" && c.severity === "SOFT");
  const passes = checks.filter((c) => c.result === "PASS").length;

  verdict.hardFailures = hardFailures;
  verdict.warnings = warnings;
  verdict.unknowns = unknowns;
  verdict.safety =
    hardFailures.length > 0
      ? "BLOCKED"
      : warnings.length > 0 || unknowns.length > 0 || softFailures.length > 0
        ? "NEEDS_REVIEW"
        : "AUTO_SAFE";
  verdict.score =
    hardFailures.length > 0
      ? 0
      : Math.max(
          0,
          Math.round(
            (100 * passes) / Math.max(1, checks.length) -
              warnings.length * 12 -
              unknowns.length * 18 -
              softFailures.length * 12 -
              scorePenalty,
          ),
        );
  return verdict;
}

export function assertNotBlocked(verdict: CompatibilityVerdict): void {
  if (verdict.safety === "BLOCKED") {
    const reasons = verdict.hardFailures.map((f) => `${f.label}: ${f.actual} vs ${f.requirement}`);
    throw new Error(
      `Refusing to proceed with ${verdict.sku}: hard compatibility requirement not met (${reasons.join("; ")})`,
    );
  }
}

/**
 * Does `haystack` contain every token of `needle`?
 *
 * Exported so the adapter path uses the same normalisation as the rules
 * themselves — a raw `String.includes` there would let "DN50" match "DN500".
 */
export function containsTokens(haystack: string, needle: string): boolean {
  return tokensContain(haystack, needle);
}
