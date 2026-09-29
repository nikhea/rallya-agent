import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { getRallyaClient } from "../utils/rallya-client.js";
import { orderSchema, pageSchema } from "../utils/rallya-schemas.js";

export const createOrderTool = createTool({
  id: "rallya-create-order",
  description:
    "Create an order for a ticket type — the first step of buying tickets. Free orders (priceCents 0) confirm immediately; priced orders enter PENDING_PAYMENT and need the Stripe checkout tool to complete payment. " +
    "An idempotency key is auto-generated when omitted; pass your own when retrying to avoid duplicate orders. " +
    "Returns the order with its id, status, price, and expiry. Check the ticket's remaining and maxPerOrder first to avoid rejections.",
  inputSchema: z.object({
    event: z.string().describe("Event UUID or slug"),
    ticketTypeId: z.string().describe("Ticket type UUID (see ticket lists)"),
    quantity: z.number().int().min(1).describe("Number of tickets to buy"),
    idempotencyKey: z.string().optional().describe("Client-generated key making retries safe; auto-generated if omitted"),
  }),
  outputSchema: orderSchema,
  execute: async ({ event, ticketTypeId, quantity, idempotencyKey }) => {
    const client = getRallyaClient();
    return await client.orders.create(event, { ticketTypeId, quantity, idempotencyKey });
  },
});

export const listMyOrdersTool = createTool({
  id: "rallya-list-my-orders",
  description:
    "List the current user's own orders with pagination — purchase history with statuses (PENDING, PENDING_PAYMENT, CONFIRMED, CANCELLED, EXPIRED). " +
    "Use when a user asks about their purchases or you need an order id for checkout/cancellation. Returns a paginated envelope.",
  inputSchema: z.object({
    page: z.number().int().min(1).optional().describe("Page number, defaults to 1"),
    perPage: z.number().int().min(1).max(100).optional().describe("Items per page, default 20, max 100"),
  }),
  outputSchema: pageSchema(orderSchema),
  execute: async ({ page, perPage }) => {
    const client = getRallyaClient();
    return await client.orders.listMine({ page, perPage });
  },
});

export const getOrderTool = createTool({
  id: "rallya-get-order",
  description:
    "Fetch a single order by id with its current status, price, and expiry. Use to check whether a priced order still needs payment, confirm a free order went through, or get details before cancelling. " +
    "Note: other people's orders resolve as 404 (the API hides existence from non-owners).",
  inputSchema: z.object({
    orderId: z.string().describe("Order UUID"),
  }),
  outputSchema: orderSchema,
  execute: async ({ orderId }) => {
    const client = getRallyaClient();
    return await client.orders.get(orderId);
  },
});

export const cancelOrderTool = createTool({
  id: "rallya-cancel-order",
  description:
    "Cancel a pending order, releasing its held tickets. Use when a buyer abandons checkout or an organizer voids an unpaid order — only pending orders can be cancelled. " +
    "Returns the order with status CANCELLED.",
  inputSchema: z.object({
    orderId: z.string().describe("Order UUID"),
  }),
  outputSchema: orderSchema,
  execute: async ({ orderId }) => {
    const client = getRallyaClient();
    return await client.orders.cancel(orderId);
  },
});

export const orderTools = {
  createOrderTool,
  listMyOrdersTool,
  getOrderTool,
  cancelOrderTool,
};
