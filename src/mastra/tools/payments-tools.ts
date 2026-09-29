import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { getRallyaClient } from "../utils/rallya-client.js";
import { checkoutResponseSchema } from "../utils/rallya-schemas.js";

export const checkoutOrderTool = createTool({
  id: "rallya-checkout-order",
  description:
    "Create a Stripe Checkout Session for a priced (PENDING_PAYMENT) order. Use immediately after creating a priced order — it returns a hosted payment URL and session id; the buyer completes payment in the browser and fulfillment lands via webhook. " +
    "Free orders never need this (they confirm on creation). Fails with 503 when Stripe is not configured on the server. " +
    "Checkout sessions are single-use and every call mints a fresh one: if an old URL shows 'completed/timed out', that session was already used or expired — just create a new checkout. " +
    "This starts a real payment — requires human approval before execution. " +
    "Returns { url, sessionId }: redirect the user to url.",
  inputSchema: z.object({
    orderId: z.string().describe("PENDING_PAYMENT order UUID (see create-order / get-order)"),
  }),
  outputSchema: checkoutResponseSchema,
  requireApproval: true,
  execute: async ({ orderId }) => {
    const client = getRallyaClient();
    return await client.payments.checkout(orderId);
  },
});

export const paymentTools = {
  checkoutOrderTool,
};
