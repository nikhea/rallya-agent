---
name: door-ops
description: Door and merch-desk operations — attendee roster, QR/manual check-in, entry stats, kit handouts, reversals. Use for guest lists, scanning attendees in, door counts, merch packs, or undoing check-ins.
---

# Door Ops

Procedures for running event entry and the merch desk. All are organizer actions (org access required).

## 1. Roster

- `rallya-list-event-roster` is the source of truth: everyone REGISTERED, CHECKED_IN, or CANCELLED. Use it to find attendee UUIDs for everything below.

## 2. Check-in

- Prefer `rallya-scan-checkin` with `attendeeId` from the roster. **No tool returns QR payloads** (hash-only storage), so only use `code` when the user pastes actual QR strings.
- Refusals are normal 200 outcomes, not errors: `ALREADY_CHECKED_IN`, `INVALID_CODE`, `CANCELLED`, `WRONG_EVENT`. Only `CHECKED_IN` grants entry — report the outcome verbatim.
- Bulk entry: `rallya-scan-batch-checkin` takes 1–50 pasted codes only. Without pasted codes, scan one by one instead.
- `rallya-get-checkin-stats` for live door counts (`registered`, `checkedIn`, `cancelled`, `total`).

## 3. Kit handouts

- `rallya-list-kits` shows live tallies (`pending`, `collected`, `voided`, `remaining`) — check stock before promising packs.
- `rallya-collect-kit`: the attendee **must already be CHECKED_IN** (422 otherwise). Default collects immediately; `reserve: true` holds a PENDING unit for later pickup, then `rallya-mark-kit-collected` on pickup. Pass `idempotencyKey` for tablet retries.
- `rallya-list-kit-collections` answers "did this person get their pack" (filter by kit, status, or attendee).

## 4. Undo order (strict sequence)

1. `rallya-void-kit-collection` for any active handouts first — revert is blocked until voided.
2. `rallya-revert-checkin` (outcome `REVERTED`).
3. Re-scan or `rallya-correct-attendee` as needed.

## 5. Walk-ins

- `rallya-add-walk-in-attendee` registers on-site arrivals (email + optional name, no order), then check them in normally. Walk-ins are not the current user's passes, so `cancel-my-attendee` does not apply to them.
