import { MCPServer } from "@mastra/mcp";
import { rallyaAgent } from "../agents/rallya-agent.js";
import {
  orgTools,
  eventTools,
  ticketTools,
  orderTools,
  paymentTools,
  attendeeTools,
  checkinTools,
  kitTools,
  subscriptionTools,
  authTools,
  auditAdminTools,
} from "../tools/index.js";

/**
 * Rallya MCP server — exposes the full Rallya tool library plus the
 * Rallya assistant to external MCP clients (Claude Code, Cursor,
 * Claude Desktop, …).
 *
 * - Every tool in the 11 domain groups is directly callable.
 * - `rallyaAgent` is exposed as the `ask_rallya` tool (natural-language
 *   questions, answered by the agent using its own tools + skills).
 *
 * When registered on the Mastra instance, the server is served over
 * Streamable HTTP at `/api/mcp/rallya/mcp`. Tools that carry
 * `requireApproval` (deletes, event cancel, member/role removal, order
 * checkout, subscription checkout/portal) surface approval rounds to
 * clients that support them.
 */
export const rallyaMcpServer = new MCPServer({
  id: "rallya",
  name: "Rallya MCP Server",
  version: "1.0.0",
  description: "Operate the Rallya event platform: organizations, events, tickets, orders, payments, attendees, check-in, kits, subscriptions, and audit.",
  instructions:
    "Use the ask_rallya tool for multi-step questions in natural language. Use the granular rallya-* tools for single precise operations. Destructive and billing tools require approval — present what will happen and wait for the decision.",
  tools: {
    ...orgTools,
    ...eventTools,
    ...ticketTools,
    ...orderTools,
    ...paymentTools,
    ...attendeeTools,
    ...checkinTools,
    ...kitTools,
    ...subscriptionTools,
    ...authTools,
    ...auditAdminTools,
  },
  agents: { rallya: rallyaAgent },
});
