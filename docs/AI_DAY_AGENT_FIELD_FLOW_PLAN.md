# AI Day Agent Field Flow Plan

Last updated: 2026-07-08

## Vision

Build the HPD dashboard into a field operations assistant that can plan the day, route through jobs, guide the user stop by stop, communicate with tenants after approval, record what happened, and prepare the final package.

The current job card, status, media, package, appointment, and map flow stays intact. The AI Day Agent becomes an optional layer on top of the existing field workflow.

## Living Plan Rule

When the user says "add to the plan", update this file with the new feature, workflow, or rule. Keep this document as the source of direction for the AI Day Agent work.

## Base And Routing Rules

- Base / return location: 87-35 114 Street, Richmond Hill, NY 11418.
- The agent should be able to start from the user's live location or from the base address.
- The user can choose any borough to start: Manhattan, Bronx, Brooklyn, Queens, Staten Island, or all boroughs.
- Manhattan to Bronx routing is one example, not a hard-coded rule. The user can ask for any route pattern.
- The route should return to base when requested.
- The map should show road-following routes, not straight-line green segments.
- Route legs should show estimated time and distance between stops.
- Jobs on the way should be suggested as optional detours, not forced stops.
- The user can override the agent at any time by selecting a job, borough, or priority.

## Route Line Design

Problem to fix: the current light green straight line is only a visual connector. It does not look like a real driving route.

Target behavior:
- Draw real road-following route polylines.
- Use a darker, stronger route color that is visible on the current map style.
- Show leg labels such as "18 min / 4.2 mi" between jobs.
- Show a route summary: total stops, total drive time, total distance, and return-to-base time.
- Support traffic-aware timing where available.
- Keep route lines behind job cards and markers so the map stays readable.

Recommended technical direction:
- Use Google Routes API `computeRoutes` for real driving route polylines, duration, distance, and traffic-aware routing.
- Use a route matrix for comparing nearby candidate jobs and "on the way" stops.
- Decode the encoded polyline and render it as the map route line.
- Keep the current straight-line fallback only when the route API is unavailable.

Reference:
- Google Routes API: https://developers.google.com/maps/documentation/routes/compute_route_directions

## Map UI Rules

- Nothing should overlap: search box, active work, layers, AI agent, job cards, and map controls must have reserved space.
- The AI Day Agent should remain visible on the map.
- The user needs quick access back to the map from any job card.
- Search must support OMO and address.
- Active/Pending layers should be easy to see, but not cover search or the agent.
- If a job appears outside New York or far away from the expected borough, mark it as "Needs geocode review" instead of putting it on the field map.
- Keep the current job cards because the user likes the direction, but reduce clutter where possible.

## Agent Conversation Flow

The user should be able to talk to the agent normally:

- "Start my day."
- "Start in Manhattan."
- "Start in the Bronx."
- "Show me jobs near me."
- "Take me to the closest pending jobs."
- "Route me from Queens to Brooklyn and return to base."
- "What jobs are on the way?"
- "Contact the tenant for this job."
- "Add a note: tenant wants next week."
- "Schedule this for next Tuesday."

Agent response should be practical:
- Recommend a borough or area for the day.
- Explain why: number of pending jobs, age, 72-hour timers, appointments, proximity, and route efficiency.
- Show the first stop on the map.
- Draw the route.
- Show time and distance between stops.
- Suggest optional jobs along the way.
- Keep a log of what the agent recommended and what the user accepted.

## Tenant Communication Flow

For apartment jobs:
- Identify tenant name, phone, apartment, and work description from ITB data when available.
- Draft a professional message using the work order number, address, contractor identity, and short work description.
- Ask tenant for available appointment dates and times.
- Save all tenant communication to the work order log.
- If no tenant phone or apartment is available, mark "Request contact information from HPD."

For public hallway / public area jobs:
- Do not require tenant contact.
- Route the user directly to the site.
- Show the work description and access instructions.

Important safety rule:
- The app must not send SMS, WhatsApp, email, or place calls without explicit user confirmation at action time.
- The agent can draft messages automatically, but sending must be approved.

Message channels to plan:
- SMS
- WhatsApp
- Email
- Phone call agent

Recommended technical direction:
- Use Twilio or another approved communication provider for SMS / WhatsApp / voice calls.
- Keep tenant messages and call summaries in the work order log.
- Support sending approved packages or updates to the WhatsApp number 917-416-0359 and the group "United Angel Construction Corp" only after the integration is configured and approved.

Reference:
- Twilio WhatsApp documentation: https://www.twilio.com/docs/whatsapp

## Appointment And Reminder Flow

Appointments should connect to Google Calendar and the app reminder system.

When a tenant gives a time:
- Save appointment date/time to the work order.
- Add it to Google Calendar.
- Include address, OMO, tenant contact, work description, and route link.
- Remind 1 day before and 2 hours before.
- Follow up with the tenant 1 day before when configured and approved.
- If appointment is past due, show "Appointment past due - reschedule" with a clear reschedule action.

Reference:
- Google Calendar event creation and reminders: https://developers.google.com/workspace/calendar/api/guides/create-events

## Field Visit And Status Flow

The agent should guide status updates without making the job card more cluttered.

Statuses:
- Pending
- Work in progress
- Work completed
- Partial work
- No access 1st
- No access 2nd
- Refused access
- Work completed by others
- Archived / final

For each status:
- Save status date/time.
- Allow a status note.
- Allow clearing or changing status when needed.
- Trigger the next workflow step.

No access:
- No Access 1st starts a 72-hour timer.
- Show countdown on map and job card.
- Alert at 24 hours remaining.
- No Access 2nd can close the job and generate affidavit/invoice without media if needed.

Work completed:
- Start job.
- Before media optional.
- After media optional.
- Finish job.
- Review package.
- Approve package.
- Ready to send.

## Media And Package Flow

The app should support:
- Take photo.
- Upload photo.
- Take video.
- Upload video.
- Before and after labels.
- Optional additional images/videos.
- Manual label edits.
- No-media package option when needed.
- Folder output and zip output.
- Status in file names: work completed, partial, refused access, no access, completed by others.
- Final package review before sending.
- Package can be sent to email or WhatsApp only after approval.

Everything should be saved to the job record:
- Media labels
- Notes
- Location proof
- Status date/time
- Package generation date
- Send/approval history

## Notes And Work Order Log

Every job should support quick notes:
- Field note from app.
- WhatsApp note.
- Tenant message note.
- Call summary.
- Appointment note.
- Status note.
- Media note.

Example:
"Tenant said come back next week. Schedule follow-up and remind one day before."

The agent should use notes to update appointment suggestions and daily route planning.

## Data Quality And Geocode Guardrails

Some job cards show outside New York. That should not happen on the field map.

Plan:
- Validate every mapped job against expected NYC borough bounds.
- If coordinates are outside NYC, do not show it as a normal marker.
- Mark the job as "Needs geocode review."
- Re-geocode from the address.
- If address is missing or ambiguous, show "Address needs review."
- Keep a data quality list for bad coordinates, missing descriptions, missing tenant data, and bad page matches.

## Privacy And Storage Rules

- Field tracking is internal only.
- Tenant communication is sensitive and must be protected.
- Do not share live user location externally unless the user approves.
- Keep audit history for status, notes, route decisions, media, packages, and sent messages.
- External sends require explicit confirmation.

## Implementation Phases

### Phase 1 - Map Control Cleanup And Real Routes

- Fix overlap between search, active work/layers, and AI agent.
- Keep AI Day Agent visible on map.
- Replace straight connector with road-following route polyline.
- Add darker route styling.
- Add route leg duration and distance labels.
- Add base return option.
- Add borough start selector / command support.

### Phase 2 - Route Planner Intelligence

- Recommend the best borough or area for the day.
- Group nearby jobs.
- Suggest optional jobs on the way.
- Score jobs by age, status, 72-hour timer, appointments, distance, and borough.
- Let user accept, skip, reorder, or redirect the route.

### Phase 3 - Agent Conversation And Job Notes

- Add a normal chat-like agent surface.
- Save conversation to the work order/day log.
- Add quick note capture on each job card.
- Let notes update appointment and route decisions.

### Phase 4 - Tenant Communication

- Draft SMS / WhatsApp / email templates.
- Add approval-before-send.
- Save sent message and reply history.
- Add phone-call agent only after provider, consent, and logging are configured.

### Phase 5 - Appointments And Calendar

- Create Google Calendar events.
- Add reminder schedule.
- Add reschedule flow.
- Add follow-up reminder and tenant confirmation message.

### Phase 6 - Media, Package, And Delivery

- Improve before/after media workflow.
- Add folder output plus zip option.
- Add status to file names.
- Send approved package to email or WhatsApp.
- Keep package audit trail.

### Phase 7 - Field Telemetry And Learning

- Track visited job locations internally.
- Record arrival/departure timestamps when approved.
- Use route history to improve future routing.
- Show "we were already near this job" suggestions.

### Phase 8 - Data Quality Hardening

- Flag out-of-NYC geocodes.
- Repair missing addresses/descriptions.
- Add data quality dashboard.
- Block bad map markers from the normal field map.

## Immediate Next Build Recommendation

Do Phase 1 first:

1. Fix all current map UI overlap.
2. Add base address and return-to-base route option.
3. Add borough chooser and free-text command.
4. Replace straight light-green line with real darker road route.
5. Show time/distance between stops.
6. Keep the straight-line fallback only if real routing is unavailable.

After Phase 1 is tested and approved, move to the tenant communication and calendar phases.
