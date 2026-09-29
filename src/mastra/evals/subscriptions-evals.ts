import type { EvalCase } from "./cases.js";

/** Subscription cases: plan browse, status, redirect-URL handoff. */
export const subscriptionsCases: EvalCase[] = [
  {
    id: "subscriptions/list-plans",
    domain: "subscriptions",
    prompt: "What subscription plans are available?",
    expectedTools: ["rallya-list-subscription-plans"],
    forbiddenTools: ["rallya-checkout-subscription", "rallya-open-subscription-portal"],
    notes: "Plan browsing stays read-only.",
  },
  {
    id: "subscriptions/get",
    domain: "subscriptions",
    prompt: "Show my subscription sub_123.",
    expectedTools: ["rallya-get-subscription"],
    forbiddenTools: ["rallya-checkout-subscription"],
    notes: "Status reads stay read-only.",
  },
  {
    id: "subscriptions/checkout",
    domain: "subscriptions",
    prompt: "Subscribe me to plan plan_pro.",
    expectedTools: ["rallya-checkout-subscription"],
    expectedText: ["http"],
    excludedText: ["subscribed successfully", "subscription active"],
    notes: "Checkout returns a browser redirect URL: hand it over, never claim billing is done.",
  },
  {
    id: "subscriptions/portal",
    domain: "subscriptions",
    prompt: "Open my billing portal so I can update my card.",
    expectedTools: ["rallya-open-subscription-portal"],
    expectedText: ["http"],
    notes: "Portal access returns a redirect URL for the user to open.",
  },
];
