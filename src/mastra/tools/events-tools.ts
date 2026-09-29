import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { getRallyaClient } from "../utils/rallya-client.js";
import { eventImageSchema, eventSchema, pageSchema } from "../utils/rallya-schemas.js";

const eventStatus = z.enum(["DRAFT", "PUBLISHED", "CANCELLED"]).optional();

const orgRef = "Org UUID or slug (slugs are the short human-readable identifier, e.g. 'acme')";
const eventRef = "Event UUID or slug";

export const listPublicEventsTool = createTool({
  id: "rallya-list-public-events",
  description:
    "Search and discover published public events across the platform. Use when a user asks what's happening, wants to browse events, or is looking for a specific event without knowing its org. " +
    "Supports text search plus status, date-range, and sort filters with pagination. No authentication is sent — only PUBLISHED events are visible. " +
    "Returns a paginated envelope with items, total, page, and perPage.",
  inputSchema: z.object({
    q: z.string().optional().describe("Free-text search, e.g. 'jazz'"),
    status: eventStatus.describe("Filter by status (public discovery is typically PUBLISHED)"),
    from: z.string().optional().describe("Only events starting at/after this ISO datetime, e.g. '2026-10-01T00:00:00Z'"),
    to: z.string().optional().describe("Only events starting at/before this ISO datetime"),
    sort: z.enum(["starts", "created"]).optional().describe("Sort by start time or creation time"),
    page: z.number().int().min(1).optional().describe("Page number, defaults to 1"),
    perPage: z.number().int().min(1).max(100).optional().describe("Items per page, default 20, max 100"),
  }),
  outputSchema: pageSchema(eventSchema),
  execute: async ({ q, status, from, to, sort, page, perPage }) => {
    const client = getRallyaClient();
    return await client.events.listPublic({ q, status, from, to, sort, page, perPage });
  },
});

export const getPublicEventTool = createTool({
  id: "rallya-get-public-event",
  description:
    "Fetch the public details of a single published event by UUID or slug. Use to show event info (title, venue, dates, capacity, cover) to someone browsing, or to resolve an event identifier before ordering tickets. " +
    "Only works for published events; drafts require the org-scoped get-event tool.",
  inputSchema: z.object({
    event: z.string().describe(eventRef),
  }),
  outputSchema: eventSchema,
  execute: async ({ event }) => {
    const client = getRallyaClient();
    return await client.events.getPublic(event);
  },
});

export const listOrgEventsTool = createTool({
  id: "rallya-list-org-events",
  description:
    "List events owned by an organization, including DRAFTs and CANCELLED events. Use for organizer-side management views — dashboards, editing flows, publishing queues. " +
    "Accepts the same search/status/date/sort filters as public discovery plus pagination. Requires org access.",
  inputSchema: z.object({
    org: z.string().describe(orgRef),
    q: z.string().optional().describe("Free-text search within the org's events"),
    status: eventStatus,
    from: z.string().optional().describe("Only events starting at/after this ISO datetime"),
    to: z.string().optional().describe("Only events starting at/before this ISO datetime"),
    sort: z.enum(["starts", "created"]).optional(),
    page: z.number().int().min(1).optional(),
    perPage: z.number().int().min(1).max(100).optional(),
  }),
  outputSchema: pageSchema(eventSchema),
  execute: async ({ org, q, status, from, to, sort, page, perPage }) => {
    const client = getRallyaClient();
    return await client.events.listOrg(org, { q, status, from, to, sort, page, perPage });
  },
});

export const createEventTool = createTool({
  id: "rallya-create-event",
  description:
    "Create a new event under an organization. Use when an organizer wants to set up an event — provide at least a title; description, venue, location, start/end times, and capacity are optional and can be added later. " +
    "New events start as DRAFT and must be published before they appear publicly. Returns the created event. Over-quota creation fails with 402 UPGRADE_REQUIRED.",
  inputSchema: z.object({
    org: z.string().describe(orgRef),
    title: z.string().describe("Event title, e.g. 'Summer Jazz Fest'"),
    slug: z.string().optional().describe("URL-friendly slug; auto-derived if omitted"),
    description: z.string().optional().describe("Long-form event description"),
    venue: z.string().optional().describe("Venue name, e.g. 'City Arena'"),
    location: z.string().optional().describe("Address or area, e.g. 'Berlin, DE'"),
    startsAt: z.string().optional().describe("Start ISO datetime, e.g. '2026-10-01T18:00:00Z'"),
    endsAt: z.string().optional().describe("End ISO datetime"),
    capacity: z.number().int().min(1).optional().describe("Total attendee capacity"),
  }),
  outputSchema: eventSchema,
  execute: async ({ org, ...input }) => {
    const client = getRallyaClient();
    return await client.events.create(org, input);
  },
});

export const getEventTool = createTool({
  id: "rallya-get-event",
  description:
    "Fetch a single org-scoped event by UUID or slug, including drafts. Use before updating, publishing, or managing tickets/kits for an event to confirm its current state and status. " +
    "A 404-style failure means the event does not exist OR the caller lacks access.",
  inputSchema: z.object({
    org: z.string().describe(orgRef),
    event: z.string().describe(eventRef),
  }),
  outputSchema: eventSchema,
  execute: async ({ org, event }) => {
    const client = getRallyaClient();
    return await client.events.get(org, event);
  },
});

export const updateEventTool = createTool({
  id: "rallya-update-event",
  description:
    "Patch an event's details — title, slug, description, venue, location, dates, capacity. Only include fields that should change; everything else is left untouched. " +
    "Set clearCover to remove the cover image. Returns the updated event.",
  inputSchema: z.object({
    org: z.string().describe(orgRef),
    event: z.string().describe(eventRef),
    title: z.string().optional(),
    slug: z.string().optional(),
    description: z.string().optional(),
    venue: z.string().optional(),
    location: z.string().optional(),
    startsAt: z.string().optional().describe("Start ISO datetime"),
    endsAt: z.string().optional().describe("End ISO datetime"),
    capacity: z.number().int().min(1).optional(),
    clearCover: z.boolean().optional().describe("Set true to remove the cover image"),
  }),
  outputSchema: eventSchema,
  execute: async ({ org, event, ...input }) => {
    const client = getRallyaClient();
    return await client.events.update(org, event, input);
  },
});

export const removeEventTool = createTool({
  id: "rallya-remove-event",
  description:
    "Permanently delete an event and its associated data. Destructive — only use after explicit user confirmation. " +
    "Returns a deletion confirmation.",
  inputSchema: z.object({
    org: z.string().describe(orgRef),
    event: z.string().describe(eventRef),
  }),
  outputSchema: z.object({ deleted: z.boolean(), event: z.string() }),
  execute: async ({ org, event }) => {
    const client = getRallyaClient();
    await client.events.remove(org, event);
    return { deleted: true, event };
  },
});

export const publishEventTool = createTool({
  id: "rallya-publish-event",
  description:
    "Publish a DRAFT event, making it visible in public discovery and available for ticket sales. Use as the final go-live step after the event details and tickets are ready. " +
    "Returns the event with status PUBLISHED.",
  inputSchema: z.object({
    org: z.string().describe(orgRef),
    event: z.string().describe(eventRef),
  }),
  outputSchema: eventSchema,
  execute: async ({ org, event }) => {
    const client = getRallyaClient();
    return await client.events.publish(org, event);
  },
});

export const unpublishEventTool = createTool({
  id: "rallya-unpublish-event",
  description:
    "Take a PUBLISHED event back offline to DRAFT, hiding it from public discovery. Use to pause sales or rework an event without cancelling it. " +
    "Returns the event with status DRAFT.",
  inputSchema: z.object({
    org: z.string().describe(orgRef),
    event: z.string().describe(eventRef),
  }),
  outputSchema: eventSchema,
  execute: async ({ org, event }) => {
    const client = getRallyaClient();
    return await client.events.unpublish(org, event);
  },
});

export const cancelEventTool = createTool({
  id: "rallya-cancel-event",
  description:
    "Cancel an event (status CANCELLED). Use when the event will not happen — distinct from unpublishing, which merely hides it. " +
    "Confirm with the user first, as attendees may need refunds or notice. Returns the cancelled event.",
  inputSchema: z.object({
    org: z.string().describe(orgRef),
    event: z.string().describe(eventRef),
  }),
  outputSchema: eventSchema,
  execute: async ({ org, event }) => {
    const client = getRallyaClient();
    return await client.events.cancel(org, event);
  },
});

export const listEventImagesTool = createTool({
  id: "rallya-list-event-images",
  description:
    "List the gallery images attached to an event, with URLs, formats, sizes, and dimensions. Use to show or audit an event's visual assets. " +
    "Returns a paginated envelope of image records. (Uploads are not exposed as a tool — files can't be passed through tool calls.)",
  inputSchema: z.object({
    org: z.string().describe(orgRef),
    event: z.string().describe(eventRef),
  }),
  outputSchema: pageSchema(eventImageSchema),
  execute: async ({ org, event }) => {
    const client = getRallyaClient();
    return await client.events.listImages(org, event);
  },
});

export const eventTools = {
  listPublicEventsTool,
  getPublicEventTool,
  listOrgEventsTool,
  createEventTool,
  getEventTool,
  updateEventTool,
  removeEventTool,
  publishEventTool,
  unpublishEventTool,
  cancelEventTool,
  listEventImagesTool,
};
