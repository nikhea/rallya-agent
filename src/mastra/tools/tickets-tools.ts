import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { getRallyaClient } from "../utils/rallya-client.js";
import { pageSchema, ticketSchema } from "../utils/rallya-schemas.js";

const orgRef = "Org UUID or slug (slugs are the short human-readable identifier, e.g. 'acme')";
const eventRef = "Event UUID or slug";

export const listPublicTicketsTool = createTool({
  id: "rallya-list-public-tickets",
  description:
    "List the ticket types an attendee can currently buy for an event. Use when a user asks about prices, availability, or wants to purchase — each entry shows price, remaining quantity, sale status, and per-order limits. " +
    "Public view: paused, draft, and sold-out tickets are flagged or hidden via forSale/soldOut. No auth required, but the event must be given as UUID — slugs are rejected on public routes.",
  inputSchema: z.object({
    event: z.string().describe("Event UUID (NOT a slug — public routes reject slugs)"),
  }),
  outputSchema: pageSchema(ticketSchema),
  execute: async ({ event }) => {
    const client = getRallyaClient();
    // NOTE: the SDK types this as TicketType[], but the wire returns a { items, total } page.
    return (await client.tickets.listPublic(event)) as unknown as {
      items: z.infer<typeof ticketSchema>[];
      total: number;
    };
  },
});

export const listTicketsTool = createTool({
  id: "rallya-list-tickets",
  description:
    "List ALL ticket types of an event for organizers, including drafts and paused ones with live sold/remaining tallies. " +
    "Use for management views, editing, or auditing sales setup — not for buyer-facing price display (use the public list for that). Requires org access.",
  inputSchema: z.object({
    org: z.string().describe(orgRef),
    event: z.string().describe(eventRef),
  }),
  outputSchema: pageSchema(ticketSchema),
  execute: async ({ org, event }) => {
    const client = getRallyaClient();
    // NOTE: the SDK types this as TicketType[], but the wire returns a { items, total } page.
    return (await client.tickets.list(org, event)) as unknown as {
      items: z.infer<typeof ticketSchema>[];
      total: number;
    };
  },
});

export const createTicketTool = createTool({
  id: "rallya-create-ticket",
  description:
    "Create a new ticket type for an event — e.g. 'General Admission', 2000 cents ($20), 100 units, max 4 per order, with an optional sale window. " +
    "Prices are in the smallest currency unit (priceCents: 0 means free). New tickets typically need activation before selling. Returns the created ticket type.",
  inputSchema: z.object({
    org: z.string().describe(orgRef),
    event: z.string().describe(eventRef),
    name: z.string().describe("Ticket name, e.g. 'GA' or 'VIP'"),
    priceCents: z.number().int().min(0).describe("Price in cents; 0 = free"),
    quantityTotal: z.number().int().min(1).describe("Total units of this type"),
    currency: z.string().optional().describe("ISO currency code, e.g. 'USD'"),
    description: z.string().optional().describe("Ticket description/perks"),
    maxPerOrder: z.number().int().min(1).optional().describe("Purchase limit per order"),
    saleStartsAt: z.string().optional().describe("Sale window start, ISO datetime"),
    saleEndsAt: z.string().optional().describe("Sale window end, ISO datetime"),
  }),
  outputSchema: ticketSchema,
  execute: async ({ org, event, ...input }) => {
    const client = getRallyaClient();
    return await client.tickets.create(org, event, input);
  },
});

export const getTicketTool = createTool({
  id: "rallya-get-ticket",
  description:
    "Fetch a single ticket type with its live sales state (sold, remaining, forSale, status). Use before updating, activating, or quoting a ticket to confirm current values. " +
    "Takes the ticket type UUID from a ticket list.",
  inputSchema: z.object({
    org: z.string().describe(orgRef),
    event: z.string().describe(eventRef),
    ticketId: z.string().describe("Ticket type UUID (see ticket lists)"),
  }),
  outputSchema: ticketSchema,
  execute: async ({ org, event, ticketId }) => {
    const client = getRallyaClient();
    return await client.tickets.get(org, event, ticketId);
  },
});

export const updateTicketTool = createTool({
  id: "rallya-update-ticket",
  description:
    "Patch a ticket type — rename, change price, adjust total quantity or per-order limit, or shift the sale window. Only include fields that should change. " +
    "Only org, event, and ticketId are required — never ask for other fields for a partial change. " +
    "Use with care on tickets that already sold units: lowering quantityTotal below quantitySold fails with 409, and growing it needs event capacity headroom. Returns the updated ticket type.",
  inputSchema: z.object({
    org: z.string().describe(orgRef),
    event: z.string().describe(eventRef),
    ticketId: z.string().describe("Ticket type UUID"),
    name: z.string().optional(),
    description: z.string().optional(),
    priceCents: z.number().int().min(0).optional(),
    currency: z.string().optional().describe("ISO currency code"),
    quantityTotal: z.number().int().min(1).optional(),
    maxPerOrder: z.number().int().min(1).optional(),
    saleStartsAt: z.string().optional().describe("ISO datetime"),
    saleEndsAt: z.string().optional().describe("ISO datetime"),
  }),
  outputSchema: ticketSchema,
  execute: async ({ org, event, ticketId, ...input }) => {
    const client = getRallyaClient();
    return await client.tickets.update(org, event, ticketId, input);
  },
});

export const removeTicketTool = createTool({
  id: "rallya-remove-ticket",
  description:
    "Permanently delete a ticket type. Prefer pausing when you just want to hide it from sale — deletion is irreversible and blocked unless zero units were sold (sold history survives even after pausing). " +
    "Requires human approval before execution. Returns a deletion confirmation.",
  inputSchema: z.object({
    org: z.string().describe(orgRef),
    event: z.string().describe(eventRef),
    ticketId: z.string().describe("Ticket type UUID"),
  }),
  outputSchema: z.object({ deleted: z.boolean(), ticketId: z.string() }),
  requireApproval: true,
  execute: async ({ org, event, ticketId }) => {
    const client = getRallyaClient();
    await client.tickets.remove(org, event, ticketId);
    return { deleted: true, ticketId };
  },
});

export const activateTicketTool = createTool({
  id: "rallya-activate-ticket",
  description:
    "Activate a ticket type (status ACTIVE) so it goes on sale to buyers, provided its sale window and event state allow it. " +
    "Use after creating/configuring a ticket when it should become purchasable. Returns the activated ticket type.",
  inputSchema: z.object({
    org: z.string().describe(orgRef),
    event: z.string().describe(eventRef),
    ticketId: z.string().describe("Ticket type UUID"),
  }),
  outputSchema: ticketSchema,
  execute: async ({ org, event, ticketId }) => {
    const client = getRallyaClient();
    return await client.tickets.activate(org, event, ticketId);
  },
});

export const pauseTicketTool = createTool({
  id: "rallya-pause-ticket",
  description:
    "Pause a ticket type (status PAUSED), hiding it from sale without deleting it or losing its configuration. " +
    "Use to temporarily stop selling a tier; re-activate later to resume. Returns the paused ticket type.",
  inputSchema: z.object({
    org: z.string().describe(orgRef),
    event: z.string().describe(eventRef),
    ticketId: z.string().describe("Ticket type UUID"),
  }),
  outputSchema: ticketSchema,
  execute: async ({ org, event, ticketId }) => {
    const client = getRallyaClient();
    return await client.tickets.pause(org, event, ticketId);
  },
});

export const ticketTools = {
  listPublicTicketsTool,
  listTicketsTool,
  createTicketTool,
  getTicketTool,
  updateTicketTool,
  removeTicketTool,
  activateTicketTool,
  pauseTicketTool,
};
