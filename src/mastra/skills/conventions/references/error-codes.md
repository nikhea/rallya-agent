# Error-code glossary

| Code | Meaning | Typical cause | Agent action |
|---|---|---|---|
| 400 | Bad request | Bad UUID/slug, bad enum value, unknown invite token, missing kit tables (server bug) | Fix input and retry once; read the message literally |
| 401 | Unauthenticated | Missing/expired token | Re-authenticate; never reveal which credential failed |
| 403 | Forbidden | Non-member, non-OWNER action, non-superadmin on `/admin/*`, API key touching admin or key-management routes | Explain the permission needed; don't retry as-is |
| 404 | Not found **or** no access | Missing object, wrong org scope, others' orders, drafts via public routes | Never distinguish the two to the user; verify identifiers and access |
| 409 | State conflict | Double cancel, quantity below sold, capacity below allocated, role delete while assigned, already-subscribed | Explain the conflict; propose the valid next state |
| 422 | Semantic refusal | Kit collect for non-`CHECKED_IN` attendee | Check the attendee in first, then retry |
| 402 | `UPGRADE_REQUIRED` | Plan quota hit (events, kits, roles, attendees) | Show the next tier up via subscription plans |
| 500 | Server bug | Unhandled failure (e.g. missing migration) | Report it; don't retry blindly |
| 503 | Unconfigured dependency | Stripe keys missing (`BILLING_UNAVAILABLE`) | Tell the user billing isn't configured |
