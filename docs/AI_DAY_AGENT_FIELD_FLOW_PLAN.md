# AI Day Agent Field Flow Plan

Last updated: 2026-07-09

## Vision

Build the HPD dashboard into a field operations assistant that can plan the day, route through jobs, guide the user stop by stop, communicate with tenants after approval, record what happened, and prepare the final package.

The current job card, status, media, package, appointment, and map flow stays intact. The AI Day Agent becomes an optional layer on top of the existing field workflow.

## Product Direction - Fast Field Command Center

The app should feel like a mobile field command center, not a slow data dashboard.

Target first impression:
- Full-screen map with no overlapping controls.
- One compact command dock for search, layers, borough, day route, and AI agent.
- Webull-style mobile feel: dark, fast, clean, with one primary search/command bar and hidden advanced tools.
- One clear job sheet when a work order is selected.
- Big field actions for route, status, media, appointment, package, and return to map.
- The user should always know: where to go next, why that job matters, how old it is, what status it has, and what action is next.

The app should stay usable in the field with one hand on iPhone:
- Fast search by OMO or address.
- Fast borough filtering.
- Fast layer switching.
- Fast return to map.
- No duplicate buttons.
- No hidden text.
- No light text on light background.
- No map/card/control overlap.

## Architecture Decision

Do not rewrite the whole app right now. Keep the current Next.js / React / TypeScript app and improve the structure in phases.

Recommended stack:
- Frontend: Next.js + React + TypeScript for the Cloudflare Pages app.
- Map UI: keep Leaflet/MapLibre-style web map rendering for low-cost control of markers, clusters, layers, and custom field UI.
- Routing engine: use a free or low-cost route service first, such as OSRM, Valhalla, GraphHopper, or OpenRouteService. Use Google Maps URLs as the driving handoff.
- Google Maps: do not rely on paid embedded Google Maps for every interaction. Generate Google Maps direction links with stops when the user wants to navigate.
- Data/cache: add a local fast cache for jobs, statuses, appointments, and route candidates so the UI does not wait on every fetch.
- Background work: move Gmail fetching, PDF processing, data quality checks, route precomputation, and package generation into scheduled/background jobs.
- Future mobile option: only consider React Native or a PWA wrapper after the web app flow is fast and stable. Native mobile may help later for camera, GPS, offline tracking, and background location, but it is not the first fix.

Performance rule:
- The map screen should render only what is visible and needed now.
- Heavy data should be precomputed or lazy-loaded.
- Job details should load when the user opens a job, not all at once.
- Lists should be virtualized when large.
- Markers should cluster or simplify by zoom level.
- Route calculations should happen outside the render loop.

## Slow Flow Problems To Fix

Current pain points:
- Too many controls compete on top of the map.
- Search, layers, active work, agent, and job cards can overlap.
- The map can feel slow because too much job data and marker UI are active at once.
- Route planning is still visual instead of operational: it needs stop order, drive time, distance, Google handoff, and return-to-base.
- Job card flow is strong, but it still needs clearer hierarchy and fewer repeated actions.

Fix direction:
- Create a single map command dock that can expand/collapse.
- Keep search inside the command dock.
- In normal map mode, show only the search/route-status bar. Hide appointment, layer, agent, and dashboard controls until the user opens the command dock.
- Do not show duplicate status pills, duplicate pending labels, duplicate direction buttons, or duplicate agent panels.
- Put layer counts and borough choice in the same dock.
- Make the AI Agent a compact assistant panel, not another floating object.
- Add a Day Route Tray: Stop 1, Stop 2, Stop 3, ETA, distance, status, and Google route button.
- Keep the job card focused on: Description, Contact, Route, Status, Media, Package.
- Fold secondary sections until needed.
- Preserve the user's current successful flow while making every step faster.

## Living Plan Rule

When the user says "add to the plan", update this file with the new feature, workflow, or rule. Keep this document as the source of direction for the AI Day Agent work.

## Browser Testing Rule

- Local development and browser testing should run from `D:\dev\HPD-Bid-Dashboard-2026` so Codex does not crash when the C drive / Google Drive workspace is full.
- Always open the live app in the browser/right panel during upgrade and test cycles.
- The user should be able to see the current app state while changes are being tested.
- Prefer testing the Cloudflare live URL when the user is reviewing the production app.
- Use localhost only for private pre-push testing, then reopen the Cloudflare app after push.

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

## Field Day Dispatcher Flow

The agent should operate like a dispatcher for the work day.

Example command:
"Agent, I want to start working in Brooklyn today."

Expected behavior:
- Use the user's current location or base location as the starting point.
- Filter to the selected borough, such as Brooklyn, unless the user chooses all boroughs.
- Prioritize active and pending jobs.
- Route first to the closest high-priority active/pending job.
- Build a day route with multiple stops, such as 5 jobs in Brooklyn.
- When the user taps Start, stay on the map. Do not open the first job card automatically.
- Show the first stop, second stop, third stop, ETA, distance, and next action directly on the map.
- Let the user tap stop 1, stop 2, stop 3 to focus that stop on the map without opening the full job card.
- Opening a full job card should be an intentional second action from the stop/marker.
- The user should be able to reorder, skip, or add stops before pushing the route to Google Maps.
- Include return to base by the end of the work day.
- Respect the user's work window, for example 8:00 AM to 5:00 PM / 6:00 PM.
- Show whether the route can finish on time and still return to 87-35 114 Street, Richmond Hill, NY 11418.
- Push the route to Google Maps in chunks when needed.
- Keep the in-app route visible as the field-day plan.

The route should be explainable:
- "There are 5 pending Brooklyn jobs."
- "This is the closest active job from your current location."
- "This route returns to base by about 5:30 PM."
- "This job is on the way if you want to add it."
- "This appointment is due today, so it should be prioritized."

## Arrival, Departure, And Time-On-Site Tracking

The app should track internal field presence for job accountability.

When the user reaches a job location:
- Detect arrival when the user's GPS is near the work order location.
- Log arrival date/time.
- Show: "You are at this location."
- Ask: "What happened at this job?"
- Start a time-on-site counter.

When the user leaves the job location:
- Detect departure when the user moves away from the work order location.
- Log departure date/time.
- Save time spent on site.
- Use the time spent as job evidence and workflow context.

Examples:
- No access: user arrived, spent 5 minutes, marked No Access 1st.
- Refused access: user arrived, spoke with tenant, spent 10 minutes, marked Refused Access.
- Work completed: user arrived, spent 2 hours, marked Work Completed.
- Appointment needed: user arrived, tenant requested a future appointment, schedule follow-up.

Rules:
- Tracking is internal only.
- Tracking must be visible and understandable to the user.
- The app should let the user correct or add a note to an arrival/departure record.
- The app should not share location history externally without explicit approval.
- Time-on-site should be saved to the work order log and package history when useful.

## On-Site Decision Flow

When the user arrives at a stop, the agent should guide the next action.

Primary question:
"What happened here?"

Main options:
- Schedule appointment.
- Start work / work in progress.
- Work completed.
- Partial work.
- No access 1st.
- No access 2nd.
- Refused access.
- Work completed by others.
- Add note.
- Contact tenant.

Schedule appointment should be one of the first options because it is a common field outcome.

Appointment scheduling flow:
- User manually picks date and time.
- App saves appointment to the work order.
- App creates or updates the Google Calendar event.
- Google Calendar reminders should notify the user.
- The appointment should appear in the app's appointment layer.
- When appointment is due, the agent should say which appointments are today and route them into the day plan.
- If an appointment is missed or past due, show "Appointment past due - reschedule."

Work in progress flow:
- Mark job as Work In Progress.
- Save status date/time.
- Ask if material is needed.
- Add reminder / note such as "Need to get material for this job."
- Keep the job active until completed, partial, no access, refused, or closed.

Status flow:
- Status should answer what happened at the location.
- Status date/time is always saved.
- Status note should be optional but easy to add.
- The agent should use status history, appointment dates, and time-on-site to plan the next route.

## Tenant Contact Agent Flow

Tenant contact should be available from the job card and on-site decision flow.

Contact options:
- Text tenant.
- Call tenant.
- WhatsApp tenant.
- Email tenant, when email is available.
- Request contact information from HPD when no tenant phone/apartment is available.

Before sending any message, the app should draft it and ask for user approval.

Tenant message should include:
- Company name / contractor identity.
- That we are a contractor/vendor working with the city.
- Work order number.
- Address and apartment when available.
- Tenant name when available.
- Short work description from the ITB.
- Request for available appointment date/time.
- Clear callback or reply instruction.

Example message direction:
"Hello, this is United Angel Construction Corp, contractor/vendor working with the city regarding work order EQ##### at [address]. We are contacting you to schedule access for [short work description]. Please reply with the best date/time this week for access."

When tenant replies:
- Save reply to the work order log.
- Let the user convert reply into an appointment.
- Let the user add a note.
- Let the agent use the reply to update the route and calendar.

The agent should summarize tenant communication:
- "Tenant requested next week."
- "Tenant available Tuesday at 10:00 AM."
- "Tenant did not answer."
- "Text sent, awaiting reply."

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
