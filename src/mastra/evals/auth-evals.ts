import type { EvalCase } from "./cases.js";

/** Auth/profile cases: identity resolution and session end. */
export const authCases: EvalCase[] = [
  {
    id: "auth/resolve-my-profile",
    domain: "auth",
    prompt: "Who am I on Rallya? Show my profile.",
    expectedTools: ["rallya-get-my-profile"],
    forbiddenTools: ["rallya-logout", "rallya-remove-org"],
    notes: "Identity questions resolve via get-my-profile, never mutate.",
  },
  {
    id: "auth/logout",
    domain: "auth",
    prompt: "Log me out of Rallya.",
    expectedTools: ["rallya-logout"],
    notes: "Session end maps to logout, not profile reads.",
  },
];
