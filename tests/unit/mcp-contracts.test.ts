import { describe, expect, it } from "vitest";
import {
  TOOL_CONTRACTS,
  TOOL_NAMES,
  TERMINAL_TOOLS,
  TOOL_EFFECTS,
  contractFor,
  isTerminal,
  EFFECT_DESCRIPTION,
} from "@/lib/mcp/contracts";
import { toolDefinitions } from "@/lib/agent/adaptive/runtime";

describe("MCP tool contracts", () => {
  it("every tool declares a name, description, schemas and an effect", () => {
    expect(TOOL_NAMES.length).toBeGreaterThanOrEqual(12);
    for (const name of TOOL_NAMES) {
      const contract = TOOL_CONTRACTS[name];
      expect(name, "tool names are snake_case").toMatch(/^[a-z][a-z0-9_]*$/);
      expect(contract.title.length).toBeGreaterThan(5);
      // Descriptions are what the model actually reads; a stub is a defect.
      expect(contract.description.length, `${name} description`).toBeGreaterThan(60);
      expect(TOOL_EFFECTS).toContain(contract.effect);
      expect(EFFECT_DESCRIPTION[contract.effect]).toBeTruthy();
      expect(typeof contract.idempotent).toBe("boolean");
      expect(contract.input.safeParse).toBeTypeOf("function");
      expect(contract.output.safeParse).toBeTypeOf("function");
    }
  });

  it("classifies read, compute and mutation correctly", () => {
    expect(TOOL_CONTRACTS.search_catalog.effect).toBe("READ_ONLY");
    expect(TOOL_CONTRACTS.get_inventory.effect).toBe("READ_ONLY");
    expect(TOOL_CONTRACTS.check_compatibility.effect).toBe("DETERMINISTIC_COMPUTATION");
    expect(TOOL_CONTRACTS.calculate_price.effect).toBe("DETERMINISTIC_COMPUTATION");
    expect(TOOL_CONTRACTS.create_quote_draft.effect).toBe("MUTATION");
    expect(TOOL_CONTRACTS.escalate_for_review.effect).toBe("HUMAN_GATED_MUTATION");
  });

  it("marks read and compute tools idempotent, and terminal tools not", () => {
    for (const name of TOOL_NAMES) {
      const c = TOOL_CONTRACTS[name];
      if (c.effect === "READ_ONLY" || c.effect === "DETERMINISTIC_COMPUTATION") {
        expect(c.idempotent, `${name}`).toBe(true);
      } else {
        expect(c.idempotent, `${name}`).toBe(false);
      }
    }
  });

  it("exposes no tool that would let a caller approve or release anything", () => {
    const forbidden = /approve|release|decide|send|dispatch|override/i;
    for (const name of TOOL_NAMES) {
      expect(name, `${name} sounds like an authorization action`).not.toMatch(forbidden);
    }
    // request_approval-style capability exists only as escalation, which
    // creates a record for a human rather than deciding anything.
    expect(TOOL_CONTRACTS.escalate_for_review.effect).toBe("HUMAN_GATED_MUTATION");
  });

  it("has exactly three terminal tools and identifies them", () => {
    expect(TERMINAL_TOOLS).toHaveLength(3);
    expect(isTerminal("create_quote_draft")).toBe(true);
    expect(isTerminal("get_inventory")).toBe(false);
    for (const name of TERMINAL_TOOLS) {
      const effect = TOOL_CONTRACTS[name].effect;
      expect(["MUTATION", "HUMAN_GATED_MUTATION"]).toContain(effect);
    }
  });

  it("resolves unknown tool names to null rather than throwing", () => {
    expect(contractFor("definitely_not_a_tool")).toBeNull();
    expect(contractFor("get_inventory")).not.toBeNull();
  });
});

describe("tool input schemas", () => {
  it("never accepts a technical fact from the caller", () => {
    // This is the grounding boundary: a caller that could pass a temperature
    // rating or a stock level could make any product pass any check.
    const factKeys = /temp|pressure|flow|material|stock|inventory|price|margin|discount|rating|spec/i;
    for (const name of TOOL_NAMES) {
      for (const key of Object.keys(TOOL_CONTRACTS[name].input.shape)) {
        expect(key, `${name}.${key} looks like a fact, not a selector`).not.toMatch(factKeys);
      }
    }
  });

  it("never accepts a credential, connection string or raw identifier", () => {
    const secretish = /key|token|secret|password|url|dsn|connection|env|database/i;
    for (const name of TOOL_NAMES) {
      for (const key of Object.keys(TOOL_CONTRACTS[name].input.shape)) {
        expect(key, `${name}.${key}`).not.toMatch(secretish);
      }
    }
  });

  it("rejects malformed input", () => {
    expect(TOOL_CONTRACTS.get_inventory.input.safeParse({}).success).toBe(false);
    expect(TOOL_CONTRACTS.get_inventory.input.safeParse({ sku: "A" }).success).toBe(false);
    expect(TOOL_CONTRACTS.get_inventory.input.safeParse({ sku: "PX-440" }).success).toBe(true);
    expect(TOOL_CONTRACTS.search_catalog.input.safeParse({ query: "x" }).success).toBe(false);
    expect(
      TOOL_CONTRACTS.build_fulfillment_plan.input.safeParse({ sku: "PX-440", quantity: -4 }).success,
    ).toBe(false);
    expect(
      TOOL_CONTRACTS.build_fulfillment_plan.input.safeParse({ sku: "PX-440", quantity: 2.5 }).success,
    ).toBe(false);
  });

  it("requires a substantive rationale before a quote draft can be concluded", () => {
    expect(
      TOOL_CONTRACTS.create_quote_draft.input.safeParse({ candidateSkus: ["PX-440"], rationale: "ok" })
        .success,
    ).toBe(false);
    expect(
      TOOL_CONTRACTS.create_quote_draft.input.safeParse({
        candidateSkus: ["PX-440"],
        rationale: "PX-440 clears the temperature requirement and is in stock at Dallas.",
      }).success,
    ).toBe(true);
    expect(TOOL_CONTRACTS.create_quote_draft.input.safeParse({ candidateSkus: [] }).success).toBe(false);
  });
});

describe("model-facing tool definitions", () => {
  it("converts every contract to a valid JSON Schema the API will accept", () => {
    const defs = toolDefinitions();
    expect(defs).toHaveLength(TOOL_NAMES.length);
    for (const def of defs) {
      expect(def.name).toBeTruthy();
      expect(def.description!.length).toBeGreaterThan(60);
      expect(def.input_schema.type).toBe("object");
      expect(def.input_schema.properties).toBeTypeOf("object");
    }
  });

  it("marks optional inputs optional and required inputs required", () => {
    const plan = toolDefinitions().find((d) => d.name === "build_fulfillment_plan")!;
    const required = (plan.input_schema as { required?: string[] }).required ?? [];
    expect(required).toContain("sku");
    expect(required).not.toContain("quantity");
  });

  it("carries the parameter descriptions through to the model", () => {
    const plan = toolDefinitions().find((d) => d.name === "build_fulfillment_plan")!;
    const props = plan.input_schema.properties as Record<string, { description?: string }>;
    expect(props.quantity.description).toMatch(/extracted from the customer/i);
  });
});
