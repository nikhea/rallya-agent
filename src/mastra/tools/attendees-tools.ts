import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { getRallyaClient } from "../utils/rallya-client.js";
import { attendeeSchema, pageSchema } from "../utils/rallya-schemas.js";

const orgRef = "Org UUID or slug (slugs are the short human-readable identifier, e.g. 'acme')";
const eventRef = "Event UUID or slug";

export const listMyAttendeesTool = createTool({
  id: "rallya-list-my-attendees",
  description:
    "List the attendee passes (tickets) owned by the current user across events, with status (REGISTERED, CHECKED_IN, CANCELLED) and check-in state. " +
    "Use when a user asks 'what tickets do I have' or you need an attendee id for cancellation or detail lookup. Returns a paginated envelope.",
  inputSchema: z.object({
    page: z.number().int().min(1).optional().describe("Page number, defaults to 1"),
    perPage: z.number().int().min(1).max(100).optional().describe("Items per page, default 20, max 100"),
  }),
  outputSchema: pageSchema(attendeeSchema),
  execute: async ({ page, perPage }, context) => {
    const client = getRallyaClient(context?.requestContext);
    return await client.attendees.listMine({ page, perPage });
  },
});

export const getMyAttendeeTool = createTool({
  id: "rallya-get-my-attendee",
  description:
    "Fetch one attendee pass of the current user by id, with its event, order, and status details — use before check-in or cancellation. " +
    "Note: passes do NOT include the QR payload (the server stores hashes only); entry codes arrive by confirmation email, so never promise to display a QR code.",
  inputSchema: z.object({
    attendeeId: z.string().describe("Attendee UUID (see list-my-attendees)"),
  }),
  outputSchema: attendeeSchema,
  execute: async ({ attendeeId }, context) => {
    const client = getRallyaClient(context?.requestContext);
    return await client.attendees.getMine(attendeeId);
  },
});

export const cancelMyAttendeeTool = createTool({
  id: "rallya-cancel-my-attendee",
  description:
    "Cancel one of the current user's attendee passes (status CANCELLED). Use when the user can't attend — confirm which pass first if they hold several. " +
    "Cancelled passes are refused at check-in. Returns the updated attendee.",
  inputSchema: z.object({
    attendeeId: z.string().describe("Attendee UUID (see list-my-attendees)"),
  }),
  outputSchema: attendeeSchema,
  execute: async ({ attendeeId }, context) => {
    const client = getRallyaClient(context?.requestContext);
    return await client.attendees.cancelMine(attendeeId);
  },
});

export const listEventRosterTool = createTool({
  id: "rallya-list-event-roster",
  description:
    "List the organizer-side attendee roster for an event — everyone registered, checked in, or cancelled. " +
    "Use for headcounts, guest-list lookups, finding an attendee id for corrections/check-in, or pre-event preparation. Requires org access. Returns a paginated envelope.",
  inputSchema: z.object({
    org: z.string().describe(orgRef),
    event: z.string().describe(eventRef),
    page: z.number().int().min(1).optional(),
    perPage: z.number().int().min(1).max(100).optional(),
  }),
  outputSchema: pageSchema(attendeeSchema),
  execute: async ({ org, event, page, perPage }, context) => {
    const client = getRallyaClient(context?.requestContext);
    return await client.attendees.listRoster(org, event, { page, perPage });
  },
});

export const addWalkInAttendeeTool = createTool({
  id: "rallya-add-walk-in-attendee",
  description:
    "Register a walk-in attendee at the door (organizer action) with just an email and optional name — no order needed. " +
    "Use for on-site registrations when someone shows up without a ticket. Returns the created attendee record.",
  inputSchema: z.object({
    org: z.string().describe(orgRef),
    event: z.string().describe(eventRef),
    email: z.string().email().describe("Walk-in's email address"),
    name: z.string().optional().describe("Walk-in's full name"),
  }),
  outputSchema: attendeeSchema,
  execute: async ({ org, event, email, name }, context) => {
    const client = getRallyaClient(context?.requestContext);
    return await client.attendees.addWalkIn(org, event, { email, name });
  },
});

export const correctAttendeeTool = createTool({
  id: "rallya-correct-attendee",
  description:
    "Correct an attendee's name or email on the roster (organizer action). Use for typos or ownership transfers — e.g. fixing a misspelled name before check-in. " +
    "Only include the fields that should change; only org, event, and attendeeId are required. Takes the attendee UUID from the roster. Returns the updated attendee.",
  inputSchema: z.object({
    org: z.string().describe(orgRef),
    event: z.string().describe(eventRef),
    attendeeId: z.string().describe("Attendee UUID (see list-event-roster)"),
    name: z.string().optional().describe("Corrected full name"),
    email: z.string().email().optional().describe("Corrected email address"),
  }),
  outputSchema: attendeeSchema,
  execute: async ({ org, event, attendeeId, name, email }, context) => {
    const client = getRallyaClient(context?.requestContext);
    return await client.attendees.correct(org, event, attendeeId, { name, email });
  },
});

export const attendeeTools = {
  listMyAttendeesTool,
  getMyAttendeeTool,
  cancelMyAttendeeTool,
  listEventRosterTool,
  addWalkInAttendeeTool,
  correctAttendeeTool,
};
