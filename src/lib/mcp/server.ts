/**
 * The Poka MCP server.
 *
 * This is a real Model Context Protocol server built on the official
 * TypeScript SDK, not a set of functions renamed "tools". It registers every
 * contract from the registry, validates inputs against their Zod schemas,
 * returns `structuredContent`, and speaks JSON-RPC over a transport.
 *
 * It runs in-process and is linked to its client by an in-memory transport
 * pair. That is a deliberate choice for this build: the protocol, the schemas
 * and the capability negotiation are all genuine, while the process boundary
 * that a stdio or HTTP transport would add buys nothing here and would make
 * the whole thing painful to run inside a test. Swapping the transport for
 * stdio is a two-line change in `client.ts` — nothing above it would notice.
 *
 * The server owns the database handle. The model talks to the server; it never
 * sees a connection string, an API key or an environment variable, because
 * none of those are in any tool's input or output schema.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { TOOL_CONTRACTS, EFFECT_DESCRIPTION, type ToolName } from "./contracts";
import { invokeHandler, ToolInputError, type HandlerContext } from "./handlers";

export const SERVER_NAME = "poka-sales-engine";
export const SERVER_VERSION = "1.0.0";

/**
 * Build a server bound to one case.
 *
 * Binding at construction is what keeps the tool inputs free of identifiers
 * the model would otherwise have to carry around — and free of the chance to
 * point a tool at a different customer's case.
 */
export function createMcpServer(ctx: HandlerContext): McpServer {
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    {
      capabilities: { tools: {} },
      instructions:
        "Deterministic technical-sales capabilities for one sales case. Compatibility, pricing, inventory and approval policy are computed by the application's engines — these tools report what those engines decided, and no tool will accept a technical fact from the caller.",
    },
  );

  for (const [name, contract] of Object.entries(TOOL_CONTRACTS) as [ToolName, (typeof TOOL_CONTRACTS)[ToolName]][]) {
    server.registerTool(
      name,
      {
        title: contract.title,
        // The effect classification travels with the description so it reaches
        // the model through the protocol rather than only living in our UI.
        description: `${contract.description}\n\nEffect: ${contract.effect} — ${EFFECT_DESCRIPTION[contract.effect]}${
          contract.idempotent ? " Repeatable without changing anything." : ""
        }`,
        inputSchema: contract.input.shape as z.ZodRawShape,
        outputSchema: contract.output.shape as z.ZodRawShape,
        annotations: {
          readOnlyHint: contract.effect === "READ_ONLY" || contract.effect === "DETERMINISTIC_COMPUTATION",
          idempotentHint: contract.idempotent,
          destructiveHint: false,
          openWorldHint: false,
        },
      },
      async (args: unknown) => {
        try {
          // Every call through this server was chosen by the model. Tagging it
          // here is what lets the trace, the UI and the eval harness tell an
          // agent decision apart from a step the finalizer took afterwards.
          const structured = await ctx.bus.withOrigin(
            { modelInitiated: true, effect: contract.effect, modelInput: args },
            () => invokeHandler(ctx, name, args),
          );
          return {
            // Both shapes are returned: `structuredContent` for clients that
            // validate against the output schema, and a text block so a plain
            // MCP client (or the Inspector) shows something useful.
            structuredContent: structured as Record<string, unknown>,
            content: [{ type: "text" as const, text: JSON.stringify(structured, null, 2) }],
          };
        } catch (error) {
          // A bad argument is the model's problem to fix, so it comes back as
          // a tool error it can read and retry — not an exception that kills
          // the run. Anything else is a real fault and propagates.
          if (error instanceof ToolInputError) {
            return {
              isError: true,
              content: [{ type: "text" as const, text: error.message }],
            };
          }
          const message = error instanceof Error ? error.message : String(error);
          return {
            isError: true,
            content: [{ type: "text" as const, text: `${name} failed: ${message}` }],
          };
        }
      },
    );
  }

  return server;
}
