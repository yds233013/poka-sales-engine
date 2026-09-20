import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../support/db";
import { CaseTracker } from "../support/cases";
import { connectMcp } from "@/lib/mcp/client";
import { ToolBus } from "@/lib/agent/toolbus";
import type { HandlerContext } from "@/lib/mcp/handlers";
import { TOOL_NAMES } from "@/lib/mcp/contracts";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";

/**
 * These drive the MCP server over a real client, so what is exercised is the
 * protocol — initialize, tools/list, tools/call — and not a direct function
 * call wearing its name.
 */

let client: Client;
let close: () => Promise<void>;
let requestId: string;
let runId: string;
let ctx: HandlerContext;

const ASOF = new Date("2026-09-20T09:00:00.000Z");
const cases = new CaseTracker(db);

beforeAll(async () => {
  // A copy, so the probe's AgentRun and ToolCalls are never attached to the
  // seeded case that the scenario suite asserts against.
  requestId = await cases.clone("REQ-2041");
  const run = await db.agentRun.create({
    data: { requestId, provider: "test", mode: "ADAPTIVE_AGENT", status: "RUNNING" },
  });
  runId = run.id;
  const bus = new ToolBus({ prisma: db, runId, requestId, asOf: ASOF });
  ctx = { prisma: db, bus, requestId, asOf: ASOF, terminal: { called: null, payload: null } };
  const session = await connectMcp(ctx);
  client = session.client;
  close = session.close;
});

afterAll(async () => {
  await close?.();
  await cases.cleanup();
  await db.$disconnect();
});

const structured = (r: unknown) => (r as { structuredContent?: Record<string, unknown> }).structuredContent;
const isError = (r: unknown) => Boolean((r as { isError?: boolean }).isError);
const text = (r: unknown) => ((r as { content?: { text?: string }[] }).content?.[0]?.text ?? "");

describe("MCP protocol surface", () => {
  it("lists every registered tool with schemas and annotations", async () => {
    const listed = await client.listTools();
    expect(listed.tools).toHaveLength(TOOL_NAMES.length);
    for (const tool of listed.tools) {
      expect(TOOL_NAMES).toContain(tool.name as never);
      expect(tool.inputSchema).toBeTruthy();
      expect(tool.outputSchema, `${tool.name} declares an output schema`).toBeTruthy();
      expect(tool.annotations).toBeTruthy();
      // The effect classification must reach the model through the protocol,
      // not only through our own UI.
      expect(tool.description).toMatch(/Effect: (READ_ONLY|DETERMINISTIC_COMPUTATION|MUTATION|HUMAN_GATED_MUTATION)/);
    }
  });

  it("marks read and compute tools read-only, and mutations not", async () => {
    const listed = await client.listTools();
    const byName = new Map(listed.tools.map((t) => [t.name, t]));
    expect(byName.get("get_inventory")!.annotations!.readOnlyHint).toBe(true);
    expect(byName.get("check_compatibility")!.annotations!.readOnlyHint).toBe(true);
    expect(byName.get("create_quote_draft")!.annotations!.readOnlyHint).toBe(false);
  });

  it("returns structuredContent that satisfies the declared output schema", async () => {
    const result = await client.callTool({ name: "get_inventory", arguments: { sku: "PX-440" } });
    const data = structured(result) as { totalAvailable: number; locations: unknown[] };
    expect(data).toBeTruthy();
    expect(typeof data.totalAvailable).toBe("number");
    expect(Array.isArray(data.locations)).toBe(true);
  });

  it("rejects malformed arguments at the protocol layer", async () => {
    const result = await client.callTool({ name: "get_inventory", arguments: { wrong: true } });
    expect(isError(result)).toBe(true);
    expect(text(result)).toMatch(/validation|invalid/i);
  });

  it("returns a readable tool error for an unknown part rather than throwing", async () => {
    const result = await client.callTool({ name: "get_inventory", arguments: { sku: "ZZ-0000" } });
    expect(isError(result)).toBe(true);
    // The message has to be actionable — the model is the one reading it.
    expect(text(result)).toMatch(/not in the catalog|search_catalog/i);
  });

  it("refuses a tool it does not expose", async () => {
    const result = await client.callTool({ name: "approve_quote", arguments: {} });
    expect(isError(result)).toBe(true);
    expect(text(result)).toMatch(/not found/i);
  });
});

describe("MCP grounding boundary", () => {
  it("will not accept caller-supplied requirements for a compatibility check", async () => {
    // The only accepted argument is a selector. A fabricated requirement set
    // is the one input that could make any product pass.
    const result = await client.callTool({
      name: "check_compatibility",
      arguments: { sku: "AX-220", requirements: [{ key: "max_fluid_temp_c", numValue: 10 }] },
    });
    const data = structured(result) as { safety: string; checks: { dimension: string; result: string }[] };
    // The extra argument is ignored; the case's own requirements still apply,
    // and AX-220 still fails on temperature for this duty.
    expect(data.safety).toBe("BLOCKED");
    expect(data.checks.some((c) => c.dimension === "temperature" && c.result === "FAIL")).toBe(true);
  });

  it("refuses a quantity that disagrees with the extracted request", async () => {
    const result = await client.callTool({
      name: "build_fulfillment_plan",
      arguments: { sku: "PX-440", quantity: 9999 },
    });
    expect(isError(result)).toBe(true);
    expect(text(result)).toMatch(/does not match the 12 extracted/i);
  });

  it("uses the extracted quantity when none is supplied", async () => {
    const result = await client.callTool({ name: "build_fulfillment_plan", arguments: { sku: "PX-440" } });
    const data = structured(result) as { requestedQty: number };
    expect(data.requestedQty).toBe(12);
  });

  it("never returns a credential, connection string or environment value", async () => {
    const names = ["resolve_customer", "get_request_state", "get_inventory", "calculate_price"];
    for (const name of names) {
      const result = await client.callTool({
        name,
        arguments: name === "get_inventory" || name === "calculate_price" ? { sku: "PX-440" } : {},
      });
      const serialized = JSON.stringify(structured(result) ?? {});
      expect(serialized, name).not.toMatch(/postgres(ql)?:\/\//i);
      expect(serialized, name).not.toMatch(/sk-ant-/i);
      expect(serialized, name).not.toMatch(/DATABASE_URL|ANTHROPIC_API_KEY/);
    }
  });
});

describe("MCP calls are recorded like any other tool call", () => {
  it("persists each call with its effect and model attribution", async () => {
    await client.callTool({ name: "get_inventory", arguments: { sku: "MX-160" } });
    const calls = await db.toolCall.findMany({ where: { runId }, orderBy: { sequence: "desc" }, take: 1 });
    expect(calls[0].toolName).toBe("get_inventory");
    expect(calls[0].modelInitiated).toBe(true);
    expect(calls[0].effect).toBe("READ_ONLY");
    expect(calls[0].summary.length).toBeGreaterThan(10);
  });

  it("gives every recorded call a unique, ordered sequence number", async () => {
    const calls = await db.toolCall.findMany({ where: { runId }, orderBy: { sequence: "asc" } });
    const sequences = calls.map((c) => c.sequence);
    expect(new Set(sequences).size).toBe(sequences.length);
    expect([...sequences].sort((a, b) => a - b)).toEqual(sequences);
  });
});
