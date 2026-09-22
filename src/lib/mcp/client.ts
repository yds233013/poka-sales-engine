/**
 * Connect an MCP client to the in-process Sales Engine server.
 *
 * The transport pair is the SDK's own in-memory implementation, so messages
 * are genuine MCP JSON-RPC — `initialize`, `tools/list`, `tools/call` — just
 * without a socket in the middle.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer, SERVER_NAME, SERVER_VERSION } from "./server";
import type { HandlerContext } from "./handlers";

export interface McpSession {
  client: Client;
  close: () => Promise<void>;
}

export async function connectMcp(ctx: HandlerContext): Promise<McpSession> {
  const server = createMcpServer(ctx);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  const client = new Client(
    { name: "sales-engine-adaptive-agent", version: SERVER_VERSION },
    { capabilities: {} },
  );

  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

  return {
    client,
    close: async () => {
      await client.close();
      await server.close();
    },
  };
}

export { SERVER_NAME, SERVER_VERSION };
