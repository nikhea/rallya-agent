import { Memory } from "@mastra/memory";

/**
 * Shared memory for the Rallya agents.
 *
 * Two layers, each with deliberate scope:
 *
 * - **Observational memory (thread scope):** background Observer/Reflector
 *   compress each conversation's raw history into a dense observation log.
 *   Scoped per thread, so long door-ops or setup sessions stay coherent
 *   without polluting other conversations. Requires a `thread` id per call.
 * - **Working memory (resource scope):** persistent user/org profile shared
 *   across ALL threads of the same resource (user). The agent maintains it
 *   via the working-memory tool: default org/event slugs, timezone,
 *   notification and checkout preferences.
 *
 * Storage comes from the Mastra instance (LibSQL), which supports both the
 * observation log and the `mastra_resources` table working memory needs.
 * Calls should pass `{ resource, thread }` — resource identifies the user
 * (shared profile), thread isolates the conversation (own observations).
 *
 * The Observer/Reflector model is overridable via RALLYA_MEMORY_MODEL
 * (any `provider/model` id); it needs its own provider key.
 */
export const rallyaMemory = new Memory({
  options: {
    lastMessages: 20,
    // Token budget over the full prompt (history + instructions + turn):
    // past maxTokens, oldest remembered messages drop in 2k chunks
    // (chunked removal keeps the prompt prefix cache-stable).
    messageHistory: { maxTokens: 8_000, atMaxRemoveTokens: 2_000 },
    observationalMemory: {
      scope: "thread",
      model: process.env.RALLYA_MEMORY_MODEL ?? "nvidia/meta/muse-glimmer-30b",
    },
    workingMemory: {
      enabled: true,
      scope: "resource",
      template: `# Organizer Profile
- **Name**:
- **Timezone**:
- **Default org** (slug):
- **Frequent events** (slugs):

## Preferences
- **Currency** (e.g. USD):
- **Communication style** (e.g. concise):

## Session state
- **Last task**:
- **Open questions**:
`,
    },
  },
});
