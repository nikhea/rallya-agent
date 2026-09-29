import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { getRallyaClient } from "../utils/rallya-client.js";
import { kitCollectionListSchema, kitCollectionSchema, kitTypeSchema } from "../utils/rallya-schemas.js";

const orgRef = "Org UUID or slug (slugs are the short human-readable identifier, e.g. 'acme')";
const eventRef = "Event UUID or slug";
const collectionStatus = z.enum(["PENDING", "COLLECTED", "VOIDED"]).optional();

export const createKitTool = createTool({
  id: "rallya-create-kit",
  description:
    "Define a named kit type for an event — e.g. 'VIP pack', 'T-shirt (M)', or 'Welcome bag' — with a total quantity of at least 1. " +
    "Kits model merch or welcome packs handed to checked-in attendees. Use this setup step before any handouts can be collected. " +
    "Kit quotas are plan-gated: over-quota creation fails with 402 UPGRADE_REQUIRED. Returns the created kit type.",
  inputSchema: z.object({
    org: z.string().describe(orgRef),
    event: z.string().describe(eventRef),
    name: z.string().describe("Kit name, e.g. 'VIP pack'"),
    description: z.string().optional().describe("What's inside / kit details"),
    quantityTotal: z.number().int().min(1).describe("Total units available"),
  }),
  outputSchema: kitTypeSchema,
  execute: async ({ org, event, name, description, quantityTotal }, context) => {
    const client = getRallyaClient(context?.requestContext);
    return await client.kits.create(org, event, { name, description, quantityTotal });
  },
});

export const listKitsTool = createTool({
  id: "rallya-list-kits",
  description:
    "List all kit types of an event with live inventory tallies: pending (reserved), collected, voided, and remaining. " +
    "Use to answer 'do we have packs left', pick a kit id for handouts, or audit merch stock. Returns an array of kit types.",
  inputSchema: z.object({
    org: z.string().describe(orgRef),
    event: z.string().describe(eventRef),
  }),
  outputSchema: z.array(kitTypeSchema),
  execute: async ({ org, event }, context) => {
    const client = getRallyaClient(context?.requestContext);
    return await client.kits.list(org, event);
  },
});

export const updateKitTool = createTool({
  id: "rallya-update-kit",
  description:
    "Patch a kit type — rename it, change its description, or adjust the total quantity (e.g. topping up stock). Only include fields that should change. " +
    "Only org, event, and kitId are required — never ask for other fields for a partial change. " +
    "Takes the kit UUID from the kit list. Returns the updated kit type.",
  inputSchema: z.object({
    org: z.string().describe(orgRef),
    event: z.string().describe(eventRef),
    kitId: z.string().describe("Kit UUID (see list-kits)"),
    name: z.string().optional(),
    description: z.string().optional(),
    quantityTotal: z.number().int().min(1).optional(),
  }),
  outputSchema: kitTypeSchema,
  execute: async ({ org, event, kitId, ...input }, context) => {
    const client = getRallyaClient(context?.requestContext);
    return await client.kits.update(org, event, kitId, input);
  },
});

export const removeKitTool = createTool({
  id: "rallya-remove-kit",
  description:
    "Permanently delete a kit type. Deletion is irreversible — void any outstanding handouts first, and only delete kits that are no longer needed. " +
    "Requires human approval before execution. Returns a deletion confirmation.",
  inputSchema: z.object({
    org: z.string().describe(orgRef),
    event: z.string().describe(eventRef),
    kitId: z.string().describe("Kit UUID (see list-kits)"),
  }),
  outputSchema: z.object({ deleted: z.boolean(), kitId: z.string() }),
  requireApproval: true,
  execute: async ({ org, event, kitId }, context) => {
    const client = getRallyaClient(context?.requestContext);
    await client.kits.remove(org, event, kitId);
    return { deleted: true, kitId };
  },
});

export const collectKitTool = createTool({
  id: "rallya-collect-kit",
  description:
    "Hand a kit to an attendee — the merch-desk operation. The attendee MUST already be CHECKED_IN, otherwise the server rejects with 422. " +
    "By default the handout is marked COLLECTED immediately; set reserve=true to hold it as PENDING (e.g. pre-assigning packs for later pickup). " +
    "Pass an idempotencyKey so tablet retries never double-issue. Returns the collection record with its status.",
  inputSchema: z.object({
    org: z.string().describe(orgRef),
    event: z.string().describe(eventRef),
    kitId: z.string().describe("Kit UUID (see list-kits)"),
    attendeeId: z.string().describe("Attendee UUID — must be CHECKED_IN (see roster / check-in stats)"),
    reserve: z.boolean().optional().describe("True to hold as PENDING instead of collecting immediately"),
    idempotencyKey: z.string().optional().describe("Client-generated key making retries safe"),
  }),
  outputSchema: kitCollectionSchema,
  execute: async ({ org, event, kitId, attendeeId, reserve, idempotencyKey }, context) => {
    const client = getRallyaClient(context?.requestContext);
    return await client.kits.collect(org, event, kitId, { attendeeId, reserve, idempotencyKey });
  },
});

export const markKitCollectedTool = createTool({
  id: "rallya-mark-kit-collected",
  description:
    "Mark a reserved (PENDING) kit handout as COLLECTED when the attendee actually picks it up. Use as the second step of the reserve-then-pickup flow. " +
    "Takes the collection UUID from the collections list. Returns the updated collection with status COLLECTED.",
  inputSchema: z.object({
    org: z.string().describe(orgRef),
    event: z.string().describe(eventRef),
    collectionId: z.string().describe("Collection UUID (see list-kit-collections)"),
  }),
  outputSchema: kitCollectionSchema,
  execute: async ({ org, event, collectionId }, context) => {
    const client = getRallyaClient(context?.requestContext);
    return await client.kits.markCollected(org, event, collectionId);
  },
});

export const voidKitCollectionTool = createTool({
  id: "rallya-void-kit-collection",
  description:
    "Void a PENDING or COLLECTED kit handout — e.g. for mistaken issues or returns. Voiding frees the unit for re-issue and is required before reverting that attendee's check-in. " +
    "Takes the collection UUID. Returns the updated collection with status VOIDED.",
  inputSchema: z.object({
    org: z.string().describe(orgRef),
    event: z.string().describe(eventRef),
    collectionId: z.string().describe("Collection UUID (see list-kit-collections)"),
  }),
  outputSchema: kitCollectionSchema,
  execute: async ({ org, event, collectionId }, context) => {
    const client = getRallyaClient(context?.requestContext);
    return await client.kits.void(org, event, collectionId);
  },
});

export const listKitCollectionsTool = createTool({
  id: "rallya-list-kit-collections",
  description:
    "List kit handout records for an event — who received what and in which state. Filter by kit, by status (PENDING/COLLECTED/VOIDED), or by attendee to answer questions like 'did this person get their pack' or 'what's still awaiting pickup'. " +
    "Returns { items, total }.",
  inputSchema: z.object({
    org: z.string().describe(orgRef),
    event: z.string().describe(eventRef),
    kitId: z.string().optional().describe("Only handouts of this kit UUID"),
    status: collectionStatus.describe("Only handouts in this state"),
    attendeeId: z.string().optional().describe("Only handouts for this attendee UUID"),
  }),
  outputSchema: kitCollectionListSchema,
  execute: async ({ org, event, kitId, status, attendeeId }, context) => {
    const client = getRallyaClient(context?.requestContext);
    return await client.kits.listCollections(org, event, { kitId, status, attendeeId });
  },
});

export const kitTools = {
  createKitTool,
  listKitsTool,
  updateKitTool,
  removeKitTool,
  collectKitTool,
  markKitCollectedTool,
  voidKitCollectionTool,
  listKitCollectionsTool,
};
