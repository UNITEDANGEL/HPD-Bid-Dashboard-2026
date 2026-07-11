# HPD AI Field Agent — End-to-End Interaction Flow

The AI Field Agent is a voice-first dispatcher and field-work coach. The speaker stays on. The agent should proactively ask one clear question at a time, show the matching action buttons, and keep the user moving through the job without duplicating the full job card.

## 1. Morning plan

Agent says:

> Good morning. Which borough should we work today, or should I select the highest-priority area?

Actions:

- Manhattan
- Bronx
- Brooklyn
- Queens
- Staten Island
- All NYC
- Choose highest priority
- Near me

After selection, the agent summarizes active jobs, No Access jobs, appointments, ready second attempts, overdue work, and missing paperwork/media.

## 2. Review ranked results

Every result shows:

- OMO and address
- reason it is recommended
- access type
- short work summary
- estimated road miles
- estimated drive time
- ETA
- Enroute button

Agent says:

> I recommend starting with [OMO] because [priority reason]. It is approximately [distance], [drive time], with an ETA of [time].

Actions:

- Start recommended
- Enroute
- Show on map
- Build full route
- Use my location
- Ask why

Planning ETA is an estimate. Enroute opens Google Maps for live traffic navigation.

## 3. Route plan

The Route tab shows ETA and distance for every leg, total drive miles, total drive time, estimated field time, and estimated finish time.

Agent says:

> Your route has [count] stops. Estimated driving is [time] over [miles]. With field time, the day should finish around [time].

Actions:

- Start route
- Rebuild
- Remove stop
- Move stop first
- Return to base
- Enroute next

## 4. Enroute

The full AI Dispatcher collapses while driving. A compact trip bar stays visible.

Agent says:

> You are enroute to [OMO] at [address]. Live directions are open. Tap Arrived when you are on site.

Trip bar:

- OMO and address
- distance remaining
- Directions
- Arrived
- Cancel

## 5. Arrived

When Arrived is tapped, the complete job card opens and the full AI Dispatcher hides. The job card is the primary work surface. A compact AI Field Agent coach is placed at the top of the job card.

Agent says:

> You arrived at [OMO]. Review the scope and access requirement. Do you have access?

Actions:

- Access granted
- No access
- Repeat instructions

## 6A. Access granted

Agent says:

> Access confirmed. Capture before media before starting work.

The agent shows:

- address
- access type
- tenant phone
- appointment
- short work summary

Actions:

- Capture before media
- Start work
- Add note

Recommended before evidence:

- 2 photos
- 2 short videos
- wide condition view
- close-up of the repair area

## 6B. No Access

Agent says:

> Record the correct No Access attempt, capture No Access evidence, and review the no-work affidavit workflow.

For first attempt:

- record No Access 1st
- capture evidence
- start 72-hour timer
- move job to waiting status

For second attempt:

- verify 72-hour eligibility
- record No Access 2nd
- capture final evidence
- open no-work affidavit/invoice package
- archive the job

## 7. Work in progress

Agent says:

> Before media is ready. Start or continue the work. Add notes for changes, materials, access problems, or partial conditions.

Actions:

- Start/resume work
- Add note
- Work finished

## 8. After media

Agent says:

> Capture after photos and videos from matching angles before selecting the final outcome.

Recommended after evidence:

- matching wide view
- matching close-up
- completed repair
- clean work area

Actions:

- Capture after media
- Media complete

## 9. Outcome

Agent asks:

> What is the correct outcome?

Actions:

- Completed
- Partial
- No Access
- Refused access
- Completed by others

The selected outcome controls the correct affidavit and invoice package.

## 10. Invoice, affidavit, media, and package

Agent says:

> Review the affidavit, invoice, labeled media, notes, and complete package before sending.

Actions:

- Affidavit
- Invoice
- Full package
- Share/send
- Finish and next

Package review includes:

- correct outcome
- correct work-completed or no-work affidavit
- invoice number and date
- ITB work description
- before/after media labels
- videos
- field notes
- manifest
- package saved or sent status

## 11. Finish and next stop

Agent says:

> The package is ready. Confirm it was saved or sent. I will return you to the route and recommend the next stop.

Actions:

- Finish + next
- Reopen package
- Return to route
- End day

## 12. End-of-day summary

Agent summarizes:

- completed jobs
- No Access first attempts
- No Access second attempts
- partial jobs
- invoices generated
- affidavits generated
- packages saved/sent
- missing media or paperwork
- jobs requiring follow-up tomorrow

The speaker remains on throughout the flow. The AI Dispatcher stays hidden while the complete job card is open, but the compact AI Field Agent coach remains available inside the job card.