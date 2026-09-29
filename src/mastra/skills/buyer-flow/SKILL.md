---
name: buyer-flow
description: Buying tickets on Rallya — discover events, check prices, create orders, pay via Stripe checkout. Use when a user wants to browse events, buy tickets, pay for an order, or asks about their purchases and passes.
---

# Buyer Flow

End-to-end procedure for attendee purchases. Each step names the tool to search for (`search_tools` finds them).

## 1. Discover (public, no auth)

- Search published events with `rallya-list-public-events`. Public routes accept **UUID only** — slugs fail with 400. If you only have a slug, resolve the UUID here first.
- Show details with `rallya-get-public-event` (UUID only). Drafts are invisible publicly.

## 2. Check tickets

- List buyable tiers with `rallya-list-public-tickets` (UUID only). Each entry carries `priceCents`, `remaining`, `maxPerOrder`, `forSale`, `soldOut`.
- Only `forSale: true` tiers can be ordered. Pause/draft/sold-out tiers are hidden or flagged — never promise them.

## 3. Order

- Create with `rallya-create-order` (event UUID + ticketTypeId + quantity). An idempotency key is auto-generated; pass your own on retries.
- **Free tickets (priceCents 0) confirm immediately** (`CONFIRMED`) and mint attendee passes. **Priced tickets** enter `PENDING_PAYMENT` and need step 4.
- Respect `maxPerOrder` and `remaining` — check them first to avoid rejections.

## 4. Pay (priced orders only)

- `rallya-checkout-order` returns `{ url, sessionId }`. Hand the URL to the user; payment happens in the browser, fulfillment lands via webhook.
- **Sessions are single-use and every call mints a fresh one.** If a URL shows "completed/timed out", it was used or expired — create a new checkout, don't debug the old URL.
- 503 means Stripe is unconfigured server-side; 402 means a quota/plan limit.

## 5. After purchase

- `rallya-list-my-orders` / `rallya-get-order` for status (`PENDING`, `PENDING_PAYMENT`, `CONFIRMED`, `CANCELLED`, `EXPIRED`).
- `rallya-list-my-attendees` for the user's passes. Passes do NOT include QR payloads (hash-only storage) — entry codes arrive by email.
- Cancel works on every live status; terminal states reject. Cancelling an order does not refund a completed Stripe payment — say so explicitly.
