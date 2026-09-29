import { z } from "zod";

/**
 * Shared Zod output schemas for the Rallya Mastra tools.
 *
 * These mirror the hand-friendly SDK types in `@rallya/sdk` (`src/types.ts`).
 * `z.object` strips unknown keys when parsing, so if the server adds new
 * fields later, validation keeps passing — the declared fields are simply
 * the contract the agent can rely on. Fields the server omits on some
 * routes are marked `.optional()`.
 */

export const permissionSchema = z.object({
  object: z.string(),
  action: z.string(),
});

export const orgSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  logoUrl: z.string().optional(),
  role: z.string().optional(),
  createdAt: z.string(),
});

export const orgMemberSchema = z.object({
  userId: z.string(),
  email: z.string(),
  name: z.string(),
  emailVerified: z.boolean(),
  role: z.string(),
  joinedAt: z.string(),
});

export const orgInviteSchema = z.object({
  id: z.string(),
  email: z.string(),
  role: z.string(),
  expiresAt: z.string(),
  createdAt: z.string(),
});

export const customRoleSchema = z.object({
  id: z.string(),
  name: z.string(),
  permissions: z.array(permissionSchema),
  holders: z.number(),
  createdAt: z.string(),
});

/** Normalized pagination envelope: { items, total, page?, perPage? }.
 * The server omits page/perPage on most routes (the SDK does not backfill
 * them despite its docs), so they are optional — Mastra output validation
 * rejects responses with missing required fields. */
export const pageSchema = <T extends z.ZodTypeAny>(item: T) =>
  z.object({
    items: z.array(item),
    total: z.number(),
    page: z.number().optional(),
    perPage: z.number().optional(),
  });

export const eventSchema = z.object({
  id: z.string(),
  title: z.string(),
  slug: z.string(),
  description: z.string().optional(),
  venue: z.string().optional(),
  location: z.string().optional(),
  startsAt: z.string().optional(),
  endsAt: z.string().optional(),
  capacity: z.number().optional(),
  coverUrl: z.string().optional(),
  status: z.enum(["DRAFT", "PUBLISHED", "CANCELLED"]),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const eventImageSchema = z.object({
  id: z.string(),
  url: z.string(),
  publicId: z.string(),
  format: z.string().optional(),
  bytes: z.number(),
  width: z.number().optional(),
  height: z.number().optional(),
  createdAt: z.string(),
});

export const ticketSchema = z.object({
  id: z.string(),
  eventId: z.string(),
  name: z.string(),
  description: z.string().optional(),
  priceCents: z.number(),
  currency: z.string(),
  quantityTotal: z.number(),
  quantitySold: z.number(),
  remaining: z.number(),
  forSale: z.boolean(),
  unavailableReason: z.string().optional(),
  maxPerOrder: z.number().optional(),
  saleStartsAt: z.string().optional(),
  saleEndsAt: z.string().optional(),
  status: z.enum(["DRAFT", "ACTIVE", "PAUSED"]),
  soldOut: z.boolean(),
  createdAt: z.string(),
});

export const orderSchema = z.object({
  id: z.string(),
  eventId: z.string(),
  ticketTypeId: z.string(),
  quantity: z.number(),
  priceCents: z.number(),
  currency: z.string(),
  status: z.enum(["PENDING", "PENDING_PAYMENT", "CONFIRMED", "CANCELLED", "EXPIRED"]),
  expiresAt: z.string().optional(),
  createdAt: z.string(),
});

export const checkoutResponseSchema = z.object({
  url: z.string(),
  sessionId: z.string(),
});

export const attendeeSchema = z.object({
  id: z.string(),
  orderId: z.string().optional(),
  unitIndex: z.number(),
  eventId: z.string(),
  userId: z.string().optional(),
  email: z.string(),
  name: z.string().optional(),
  status: z.enum(["REGISTERED", "CHECKED_IN", "CANCELLED"]),
  qrPayload: z.string().optional(),
  checkedInAt: z.string().optional(),
  createdAt: z.string(),
});

export const scanResultSchema = z.object({
  outcome: z.enum([
    "CHECKED_IN",
    "ALREADY_CHECKED_IN",
    "INVALID_CODE",
    "CANCELLED",
    "WRONG_EVENT",
    "REVERTED",
  ]),
  method: z.enum(["qr", "manual"]),
  attendeeId: z.string().optional(),
  checkedInAt: z.string().optional(),
});

export const checkinStatsSchema = z.object({
  registered: z.number(),
  checkedIn: z.number(),
  cancelled: z.number(),
  total: z.number(),
});

export const kitTypeSchema = z.object({
  id: z.string(),
  eventId: z.string(),
  name: z.string(),
  description: z.string().optional(),
  quantityTotal: z.number(),
  pending: z.number(),
  collected: z.number(),
  voided: z.number(),
  remaining: z.number(),
  createdAt: z.string(),
});

export const kitCollectionSchema = z.object({
  id: z.string(),
  kitId: z.string(),
  kitName: z.string().optional(),
  eventId: z.string(),
  attendeeId: z.string(),
  status: z.enum(["PENDING", "COLLECTED", "VOIDED"]),
  collectedAt: z.string().optional(),
  collectedBy: z.string().optional(),
  createdAt: z.string(),
});

/** Kit handout listing: { items, total } (no page envelope on this route). */
export const kitCollectionListSchema = z.object({
  items: z.array(kitCollectionSchema),
  total: z.number(),
});

export const subscriptionTierSchema = z.object({
  plan: z.enum(["FREE", "PRO", "SCALE"]),
  name: z.string(),
  priceId: z.string().optional(),
  monthlyCents: z.number().optional(),
  currency: z.string().optional(),
  limits: z.object({
    maxEvents: z.number(),
    maxMembers: z.number(),
    maxAttendeesPerEvent: z.number(),
    maxKitsPerEvent: z.number(),
  }),
  features: z.array(z.string()),
});

export const subscriptionSchema = z.object({
  plan: z.enum(["FREE", "PRO", "SCALE"]),
  status: z.enum(["ACTIVE", "PAST_DUE", "CANCELED"]),
  currentPeriodEnd: z.string().optional(),
  cancelAtPeriodEnd: z.boolean(),
});

export const auditEventSchema = z.object({
  id: z.string(),
  orgId: z.string().optional(),
  actorId: z.string().optional(),
  action: z.string(),
  objectType: z.string(),
  objectId: z.string().optional(),
  before: z.string().optional(),
  after: z.string().optional(),
  createdAt: z.string(),
});

export const meSchema = z.object({
  id: z.string(),
  email: z.string(),
  emailVerified: z.boolean(),
  profile: z.object({
    firstName: z.string().optional(),
    lastName: z.string().optional(),
  }),
  organizations: z
    .array(
      z.object({
        id: z.string(),
        slug: z.string(),
        name: z.string(),
        role: z.string(),
        joinedAt: z.string().optional(),
      })
    )
    .optional(),
});

export const messageSchema = z.object({
  message: z.string(),
});

/** Platform admin org row as returned by GET /admin/orgs. */
export const adminOrgSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  members: z.number(),
  createdAt: z.string(),
});

/** Loose record for untyped admin/health payloads. */
export const recordSchema = z.record(z.string(), z.unknown());

export const healthLiveSchema = z.object({
  status: z.string(),
  app: z.string(),
});
