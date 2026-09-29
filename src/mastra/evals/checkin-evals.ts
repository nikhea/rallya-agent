import type { EvalCase } from "./cases.js";

/**
 * Check-in cases: QR vs manual entry, batch lanes, reverts, live stats.
 * Refusals (ALREADY_CHECKED_IN, INVALID_CODE, CANCELLED, WRONG_EVENT) are
 * normal HTTP-200 outcomes — never errors, never retried as failures.
 */
export const checkinCases: EvalCase[] = [
  {
    id: "checkin/scan-qr",
    domain: "checkin",
    prompt: "Check in this pass for event launch-night in org acme. QR: QR-ABC-123.",
    expectedTools: ["rallya-scan-checkin"],
    forbiddenTools: ["rallya-revert-checkin"],
    maxToolCalls: 8,
    notes: "QR payloads go through single scan; refusals are reported, not errors.",
  },
  {
    id: "checkin/scan-manual",
    domain: "checkin",
    prompt: "Check in attendee att_123 manually for event launch-night in org acme, no QR available.",
    expectedTools: ["rallya-scan-checkin"],
    excludedText: ["QR payload", "QR code required"],
    notes: "Manual entry uses attendeeId; must not demand a QR code.",
  },
  {
    id: "checkin/scan-batch",
    domain: "checkin",
    prompt: "Check in this whole queue at once for event launch-night in org acme. Codes: QR-1, QR-2, QR-3.",
    expectedTools: ["rallya-scan-batch-checkin"],
    notes: "Bulk lanes use batch scan, not repeated single scans.",
  },
  {
    id: "checkin/revert",
    domain: "checkin",
    prompt: "Undo the check-in for attendee att_123 at event launch-night in org acme — it was an accidental scan.",
    expectedTools: ["rallya-revert-checkin"],
    notes: "Accidental scans map to revert-checkin.",
  },
  {
    id: "checkin/stats",
    domain: "checkin",
    prompt: "How full is event launch-night in org acme right now?",
    expectedTools: ["rallya-get-checkin-stats"],
    forbiddenTools: ["rallya-scan-checkin", "rallya-revert-checkin"],
    notes: "Headcounts read stats; scanning tools must stay untouched.",
  },
];
