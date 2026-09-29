import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { getRallyaClient } from "../utils/rallya-client.js";
import { checkinStatsSchema, scanResultSchema } from "../utils/rallya-schemas.js";

const orgRef = "Org UUID or slug (slugs are the short human-readable identifier, e.g. 'acme')";
const eventRef = "Event UUID or slug";

export const scanCheckinTool = createTool({
  id: "rallya-scan-checkin",
  description:
    "Perform a door check-in scan for one attendee — the core door-tablet operation. Provide EXACTLY ONE of: code (the QR payload from the attendee pass) or attendeeId (manual lookup fallback). " +
    "Refusals are NOT errors: they come back as HTTP 200 with an outcome of ALREADY_CHECKED_IN, INVALID_CODE, CANCELLED, or WRONG_EVENT — only CHECKED_IN means entry granted. " +
    "Works with server-to-server API keys, making it ideal for door tablets. Returns the scan result with outcome, method (qr/manual), attendee id, and timestamp.",
  inputSchema: z.object({
    org: z.string().describe(orgRef),
    event: z.string().describe(eventRef),
    code: z.string().optional().describe("QR payload from the attendee pass (preferred)"),
    attendeeId: z.string().optional().describe("Attendee UUID for manual check-in when no QR is available"),
  }),
  outputSchema: scanResultSchema,
  execute: async ({ org, event, code, attendeeId }) => {
    if (!code && !attendeeId) {
      throw new Error("Provide exactly one of code or attendeeId");
    }
    const client = getRallyaClient();
    return await client.checkin.scan(org, event, { code, attendeeId });
  },
});

export const scanBatchCheckinTool = createTool({
  id: "rallya-scan-batch-checkin",
  description:
    "Check in many attendees at once by submitting up to 50 QR codes in a single call. Use for bulk entry lanes, re-scanning a queue, or catching up after offline scanning. " +
    "Each code gets its own result entry with the same outcome semantics as single scans (CHECKED_IN vs ALREADY_CHECKED_IN/INVALID_CODE/etc). " +
    "Returns { results } — one ScanResult per submitted code, in order.",
  inputSchema: z.object({
    org: z.string().describe(orgRef),
    event: z.string().describe(eventRef),
    codes: z.array(z.string()).min(1).max(50).describe("QR payloads to scan, 1–50 codes"),
  }),
  outputSchema: z.object({ results: z.array(scanResultSchema) }),
  execute: async ({ org, event, codes }) => {
    const client = getRallyaClient();
    return await client.checkin.scanBatch(org, event, codes);
  },
});

export const revertCheckinTool = createTool({
  id: "rallya-revert-checkin",
  description:
    "Undo (revert) an attendee's check-in, e.g. for accidental scans or when someone leaves and re-entry must be tracked fresh. " +
    "Fails if the attendee has active (non-voided) kit collections — void those first. Returns the scan result with outcome REVERTED.",
  inputSchema: z.object({
    org: z.string().describe(orgRef),
    event: z.string().describe(eventRef),
    attendeeId: z.string().describe("Attendee UUID whose check-in should be undone"),
  }),
  outputSchema: scanResultSchema,
  execute: async ({ org, event, attendeeId }) => {
    const client = getRallyaClient();
    return await client.checkin.revert(org, event, attendeeId);
  },
});

export const getCheckinStatsTool = createTool({
  id: "rallya-get-checkin-stats",
  description:
    "Get live door numbers for an event: how many registered, checked in, and cancelled out of the total. " +
    "Use for at-a-glance dashboards, 'how full is it' questions, or deciding when to close entry. Returns { registered, checkedIn, cancelled, total }.",
  inputSchema: z.object({
    org: z.string().describe(orgRef),
    event: z.string().describe(eventRef),
  }),
  outputSchema: checkinStatsSchema,
  execute: async ({ org, event }) => {
    const client = getRallyaClient();
    return await client.checkin.stats(org, event);
  },
});

export const checkinTools = {
  scanCheckinTool,
  scanBatchCheckinTool,
  revertCheckinTool,
  getCheckinStatsTool,
};
