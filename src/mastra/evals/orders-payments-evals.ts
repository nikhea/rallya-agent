import type { EvalCase } from "./cases.js";

/** Order + payment cases: purchase flow, redirect-URL handoff. */
export const ordersCases: EvalCase[] = [
  {
    id: "orders/create",
    domain: "orders",
    prompt: "Buy 2 VIP tickets for summer-fest with email buyer@example.com.",
    expectedTools: ["rallya-create-order"],
    notes: "Purchase starts with create-order.",
  },
  {
    id: "orders/list-mine",
    domain: "orders",
    prompt: "Show my orders.",
    expectedTools: ["rallya-list-my-orders"],
    forbiddenTools: ["rallya-cancel-order", "rallya-create-order"],
    notes: "Order history stays read-only.",
  },
  {
    id: "orders/get",
    domain: "orders",
    prompt: "Show me order ord_123.",
    expectedTools: ["rallya-get-order"],
    forbiddenTools: ["rallya-cancel-order"],
    notes: "Detail reads stay read-only.",
  },
  {
    id: "orders/cancel-confirmed",
    domain: "orders",
    prompt: "Yes, cancel order ord_123 — I confirm.",
    expectedTools: ["rallya-cancel-order"],
    notes: "Cancellation runs only on explicit confirmation.",
  },
];

export const paymentsCases: EvalCase[] = [
  {
    id: "payments/checkout-order",
    domain: "payments",
    prompt: "Check out order ord_123 so I can pay.",
    expectedTools: ["rallya-checkout-order"],
    expectedText: ["http"],
    excludedText: ["paid successfully", "payment complete"],
    notes: "Checkout returns a browser redirect URL: hand it over, never claim payment is done.",
  },
];
