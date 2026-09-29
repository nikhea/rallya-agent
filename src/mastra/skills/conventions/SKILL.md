---
name: conventions
description: Rallya API ground rules — UUID-vs-slug routing, pagination envelopes, stealth 404s, and the error-code glossary. Load when an API call fails unexpectedly or before reasoning about identifiers and error handling.
---

# Conventions

Cross-cutting rules that apply to every Rallya domain. See [error codes](references/error-codes.md) for the full glossary.

## Identifiers

- Org-scoped routes accept **UUID or slug** (`orgs/{org}/events/{event}`).
- **Public/buyer routes accept UUID only** — `get-public-event`, `list-public-tickets`, `create-order` reject slugs with `400 invalid event id`. Resolve UUIDs via `rallya-list-public-events` first.

## Pagination

- List routes take `page` (default 1) / `perPage` (default 20, max 100) and return `{ items, total, page, perPage }`.
- Full-list routes (ticket lists, images, kit collections) return `page: 1, perPage: <count>`.

## Errors

- **Stealth 404s**: missing OR no-access both read as 404. Never tell the user which one it is.
- **400** bad input (bad UUID, bad enum, unknown invite token). **401** unauthenticated. **403** forbidden (non-member, non-OWNER, non-superadmin).
- **409** state conflicts: double cancel, quantity below sold, capacity below allocated, role delete while assigned, already-subscribed.
- **422** semantic refusal: kit collect for a non-checked-in attendee.
- **402** `UPGRADE_REQUIRED`: plan quota hit. **500** server bug (report it, don't retry blindly). **503** unconfigured Stripe.
- Tool *input* failures (bad enum like `sort: "start"`) are caught before any API call — valid values are `starts`/`created`; read the error literally and retry.
- Tool *output* failures surface as `{ error: true, message }` resolved values, not throws.
