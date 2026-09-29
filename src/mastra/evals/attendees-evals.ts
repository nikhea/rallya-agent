import type { EvalCase } from "./cases.js";

/** Attendee cases: self-service vs organizer roster ops. */
export const attendeesCases: EvalCase[] = [
  {
    id: "attendees/list-mine",
    domain: "attendees",
    prompt: "Show my event registrations.",
    expectedTools: ["rallya-list-my-attendees"],
    forbiddenTools: ["rallya-cancel-my-attendee", "rallya-correct-attendee"],
    notes: "Self-service listing stays read-only.",
  },
  {
    id: "attendees/get-mine",
    domain: "attendees",
    prompt: "Show my registration att_123.",
    expectedTools: ["rallya-get-my-attendee"],
    forbiddenTools: ["rallya-cancel-my-attendee"],
    notes: "Detail reads stay read-only.",
  },
  {
    id: "attendees/cancel-mine-confirmed",
    domain: "attendees",
    prompt: "Yes, cancel my registration att_123 — I confirm.",
    expectedTools: ["rallya-cancel-my-attendee"],
    notes: "Self-cancellation runs only on explicit confirmation.",
  },
  {
    id: "attendees/list-roster",
    domain: "attendees",
    prompt: "Show the attendee roster for event launch-night in org acme.",
    expectedTools: ["rallya-list-event-roster"],
    forbiddenTools: ["rallya-cancel-my-attendee"],
    notes: "Organizer roster uses the event-scoped tool, not self-service ones.",
  },
  {
    id: "attendees/add-walk-in",
    domain: "attendees",
    prompt: "Add a walk-in, John Doe, to event launch-night in org acme.",
    expectedTools: ["rallya-add-walk-in-attendee"],
    expectedText: ["John Doe"],
    notes: "Door walk-ins map to add-walk-in-attendee with the given name.",
  },
  {
    id: "attendees/correct",
    domain: "attendees",
    prompt: "Fix attendee att_123: the email should be john@example.com.",
    expectedTools: ["rallya-correct-attendee"],
    forbiddenTools: ["rallya-cancel-my-attendee"],
    notes: "Corrections edit in place, never cancel + recreate.",
  },
];
