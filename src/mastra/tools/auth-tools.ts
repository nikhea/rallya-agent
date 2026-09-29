import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { getRallyaClient } from "../utils/rallya-client.js";
import { meSchema, messageSchema } from "../utils/rallya-schemas.js";

export const getMyProfileTool = createTool({
  id: "rallya-get-my-profile",
  description:
    "Get the current authenticated user's profile: id, email, email-verification state, name, and the list of organizations they belong to with roles. " +
    "Use at the start of a session to identify who you're acting as, or to resolve 'my org' into concrete org identifiers for other tools. " +
    "(Login/registration are intentionally NOT tools — credentials belong in environment config, never in model context.)",
  inputSchema: z.object({}),
  outputSchema: meSchema,
  execute: async (_args, context) => {
    const client = getRallyaClient(context?.requestContext);
    return await client.auth.me();
  },
});

export const logoutTool = createTool({
  id: "rallya-logout",
  description:
    "Log out the current user session, revoking it server-side. Use when the user explicitly asks to sign out. " +
    "Note this ends the session the agent itself runs on, so further authenticated calls will fail until new credentials are configured. Returns a confirmation message.",
  inputSchema: z.object({}),
  outputSchema: messageSchema,
  execute: async (_args, context) => {
    const client = getRallyaClient(context?.requestContext);
    return await client.auth.logout();
  },
});

export const authTools = {
  getMyProfileTool,
  logoutTool,
};
