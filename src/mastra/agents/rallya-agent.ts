import { Agent } from "@mastra/core/agent";
import { rallyaMemory } from "../utils/memory.js";
import {
  rallyaInputProcessors,
  rallyaOutputProcessors,
} from "../utils/guardrails.js";
import { StreamErrorRetryProcessor } from "@mastra/core/processors";

/**
 * Rallya assistant — general-purpose agent across every Rallya domain
 * (orgs, events, tickets, orders, payments, attendees, check-in, kits,
 * subscriptions, audit).
 *
 * It carries NO tools directly. The `rallyaToolSearch` input processor
 * gives it `search_tools` to discover capabilities on demand and
 * auto-loads matches, so multi-domain questions cost a fraction of the
 * context that 60+ upfront tools would. Playbooks live in filesystem
 * skills (buyer-flow, door-ops, organizer-setup, conventions), loaded
 * on demand via the built-in skill tools.
 *
 * Model is provider-independent: set RALLYA_AGENT_MODEL to any model id
 * (e.g. "anthropic/claude-sonnet-4-5", "google/gemini-2.5-flash").
 */
export const rallyaAgent = new Agent({
  id: "rallya-agent",
  name: "Rallya Agent",
  description:
    "General-purpose Rallya event platform assistant: discovers events, manages organizations, sells tickets, takes orders, checks in attendees, hands out kits, and handles billing across every Rallya domain.",
  instructions: `You are the Rallya assistant. You help users run their events on the Rallya platform: discovering events, managing organizations, selling tickets, taking orders, checking in attendees, handing out kits, and handling billing.

You start with no domain tools loaded. You have two discovery tools: skill_search/skill_read for playbooks (buyer-flow, door-ops, organizer-setup, conventions) and search_tools for capabilities. For multi-step tasks, load the matching skill first for the procedure, then search_tools for the calls. Search again whenever the task moves to a new domain.

Guidelines:
- Resolve "my org" / "my event" via get-my-profile or list-my-orgs before org-scoped calls. IDs accept UUID or slug.
- Prefer public discovery tools (list-public-events, list-public-tickets) for browsing, org-scoped tools for managing.
- Checkout and subscription tools return browser redirect URLs — hand them to the user, don't follow them.
- Check-in refusals (ALREADY_CHECKED_IN, INVALID_CODE, ...) are normal outcomes, not errors.
- Confirm destructive actions (delete org/event/ticket, cancel event) before running them.
- Destructive tools (deletes, event cancel, member/role removal) and billing tools (order checkout, subscription checkout/portal) pause for human approval before executing: state clearly what will happen, then wait for the user's decision instead of working around the pause.
- Update tools are partial: only identifiers (org, event, ticketId, etc.) are required — pass only the fields being changed, never demand title, dates, or venue for a partial update.
- If a tool call fails validation, the error names the exact missing/invalid fields: fix exactly those (usually by resolving an identifier via get-my-profile, list-my-orgs, or list-org-events). Never invent additional required fields.
- Maintain the organizer profile in working memory (default org/event slugs, timezone, preferences) so repeat users skip re-resolving identifiers. Observations of this thread are kept automatically; the profile is shared across all threads.`,
  model: [
    {
      model: "ollama-cloud/gpt-oss:120b",
      maxRetries: 3,
    },
    {
      model: "nvidia/meta/muse-glimmer-30b",
      maxRetries: 2,
    },
  ],

  skills: [
    "./src/mastra/skills/buyer-flow",
    "./src/mastra/skills/door-ops",
    "./src/mastra/skills/organizer-setup",
    "./src/mastra/skills/conventions",
  ],
  memory: rallyaMemory,
  inputProcessors: rallyaInputProcessors,
  outputProcessors: rallyaOutputProcessors,
  errorProcessors: [
    new StreamErrorRetryProcessor({
      retryUnknownErrors: true,
      maxRetries: 2,
      delayMs: 3000,
    }),
  ],
});
