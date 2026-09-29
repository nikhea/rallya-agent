---
name: organizer-setup
description: Setting up events as an organizer — organizations, event lifecycle, ticket tiers, publishing, edits, roles, and quotas. Use when creating or managing events, tiers, members, or resolving quota and lifecycle errors.
---

# Organizer Setup

Procedures for getting an event live and managing it. Resolve identifiers first: `rallya-get-my-profile` → `rallya-list-my-orgs` → `rallya-list-org-events`. Never guess UUIDs or slugs.

## 1. Go-live sequence (in order)

1. Create the org (`rallya-create-org`) if needed — caller becomes OWNER. Slugs auto-derive; explicit taken slugs 409.
2. `rallya-create-event` (starts as DRAFT; only `org` + `title` truly needed, rest later).
3. `rallya-create-ticket` tiers (priceCents 0 = free; watch `maxPerOrder` and sale windows).
4. `rallya-activate-ticket` each tier — created tiers are DRAFT and won't sell until activated.
5. `rallya-publish-event` — only now does the event appear publicly. Lifecycle is `DRAFT → PUBLISHED → DRAFT` (unpublish) or `→ CANCELLED` (terminal, irreversible).

## 2. Editing

- All update tools are **partial**: only identifiers (`org`, `event`, `ticketId`, …) are required. Pass only changed fields; never demand title, dates, or venue for a partial change.
- Lowering event capacity below allocated tickets, or ticket quantity below sold counts, fails with 409.
- Changing an org slug breaks URLs — confirm first.

## 3. People and roles

- Members: invite by email (`rallya-invite-org-member`; email must match their account to accept) or direct-add registered users. List members to get user UUIDs; the last OWNER can never be demoted or removed.
- Custom roles are `object:action` bundles (e.g. door staff `checkin:create`); unknown pairs are rejected, deletion 409s while assigned.

## 4. Quotas and errors

- Over-quota writes fail `402 UPGRADE_REQUIRED` (events, kits, roles, attendees). Check the plan via `rallya-get-subscription`, compare tiers via `rallya-list-subscription-plans`.
- Destructive calls (deletes, cancel, member/role removal) and billing calls pause for **human approval** — state the action and wait; approval is per exact arguments.
