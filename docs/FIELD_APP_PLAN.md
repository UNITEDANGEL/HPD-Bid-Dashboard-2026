# HPD Field App: Master Plan

Every request from the owner, in one place. Each item is fixed, tested, pushed live, and checked off here.
Live app: https://hpd-bid-dashboard-2026.pages.dev/map/

## Done (live)

### Paperwork and affidavits
- [x] Signed copy (principal + notary) and unsigned print copy, shown together on one review screen
- [x] Saved one-tap signatures for Jotjagraj Singh and Chetanpreet Malhi; notary still confirms "witnessed" every affidavit
- [x] Notary approval builds the package automatically (no extra Generate tap), even if the job was still loading
- [x] Approve emails ONLY the signed copy, with before/after photos; no Google Drive link in that email
- [x] Unsigned print copy saved to Drive only, never emailed
- [x] Drive filing: HPD Packages / year / month / borough / "date - OMO - address - outcome", with Before photos / After photos folders
- [x] Affidavit text never overlaps or gets cut off (7a, blank fields, long names); automatic overlap checker
- [x] Notary stamp no longer covers "Notary Public" on No Work affidavits
- [x] Edit any detail or date on the review screen, then "Update package" without signing again
- [x] Work dates default to the day the package is generated; work start = the day of the before photos; all editable
- [x] Dates only on anything that goes out (PDFs, email, Drive); times kept inside the app
- [x] Work description shown and editable; a package can't be built with a missing or blank-form description
- [x] ER04964 + 4 other jobs: blank ITB form text was being used as the scope; root cause fixed (OCR on scanned ITBs, junk detection)

### Job card
- [x] Job description at the top with Read aloud / Stop
- [x] Completed jobs: "Completed. No need to come back." + "Everything is correct: Archive" after paperwork approval
- [x] Approval no longer archives by itself; you archive when you're sure
- [x] Clear outcome (e.g. No access, then access given), keeping photos and history
- [x] No access / Refused can skip photos

### Map
- [x] Opens fast: jobs show instantly from the phone's saved copy, then refresh
- [x] Reopens exactly where you left it (position, zoom, filters)
- [x] Black bar behind the search box removed; messages sit below the search
- [x] Filter button next to the search (status, borough, date type, date windows)
- [x] Borough icon bar (All, MN, BK, QN, BX, SI) + 30 / 60 / 90 days / Custom under the search
- [x] Completed jobs show a green check-mark pin
- [x] Pin colors readable from far away: **blue = new**, **green = completed**, **red = refused**, **grey = no access**, **purple = completed by others**, amber = appointment, orange = partial; a different icon for each
- [x] Pins grow as you zoom in; the pin nearest the middle of the screen glows
- [x] Opens on **my location** every time and follows me; dragging pauses it, the locate button resumes it
- [x] 30 / 60 / 90 days and status filters never move the map (no more jumping to the middle of Queens); only a borough tap or a search moves it
- [x] Big, clear blue "You" marker, always on top of every pin
- [x] Waze / Google taps are recorded on the job card: "On the way · Waze · date"
- [x] Videos go in the signed email (before and after); a video too big to attach gets its own Drive link in the email. Drive: Before videos / After videos folders
- [x] Map alert "⚠ N jobs need a check": open jobs with no readable scope, no map location, no address or no award amount; tap one to open it
- [x] **Mobile flow up to finish**: Start work opens glowing "Take before photo / Record before video" right in the step (the before media starts the job); Finish work opens the after buttons; the first after photo/video finishes the job by itself (Work completed, one tap to switch to Partial); No access / Refused / By others save on the card without leaving it
- [x] Job card shows where the job stands (e.g. "✅ Work completed · ready to close out", "🔒 No access") right above the Before/After photos, directly under the steps
- [x] When a job finishes, its package opens for review by itself after a 6-second countdown ("Wait, add more" cancels)
- [x] The open job card has priority over "follow me": the map stops following and keeps the job's pin in view above the card
- [x] Tapping a pin keeps your zoom; closing the card puts the map back where it was, so every other job is still there to tap (they seemed to "not open" because the map stayed zoomed on the last job)
- [x] **Automatic building picture**: Google Street View of the building (camera aimed at it), as a banner at the top of the job card and in Documents; your own building photo replaces it. Key added and confirmed by Google (Actions → "Check Google Maps key" re-checks it)
- [x] App updates itself to the newest version when you come back to it (only when no job card is open); the map menu shows the version
- [x] Adding more after shots to a finished job offers the package again
- [x] Fixed "stuck on an old job": coming back from paperwork opened the job AND forced the search box to it (only 1 pin showed) and its borough; the address kept the job, so the iPhone app reopened it every time. Now the card opens once, the address is cleared, no forced search/borough; old stuck filters reset once
- [x] Map page locked to the visible screen: no page scroll and no black strip under Today's route on the iPhone
- [x] **📋 Ready to close out** on the map: every finished job without an approved package, with a Package → button, for closing out later at the desk
- [x] Review screen choice: email **Before + after** or **After only** (Drive always keeps everything); the phone remembers the choice
- [x] **Start over** on any job card (type CLEAR): clears outcome, steps, trip, package status and ALL photos/videos of the job, on the phone and the status server
- [x] **Test mode** for any real job (e.g. ER05150): packages marked TEST, filed in Drive under "TEST jobs / <job>"; turn it off to go back to normal folders
- [x] Videos with no file type (iPhone .MOV) now go in the email; review screen shows "Email: signed PDF · N photos · N videos" before approving; after sending it says exactly what went
- [x] Jobs no longer drop off the map when their status changes: the open job and any job worked today stay visible (Pending filter used to hide them)
- [x] Photo/video save errors show in red right in the steps
- [x] "+ More before photos / video" and "+ More after photos / video" buttons on the steps
- [x] Fixed: starting work used to mark "Finish the job" as done, skipping Work completed / Partial
- [x] Job card flow starts with **Go there** (Waze / Google) right under the description
- [x] Email photos use the full ~25 MB email: few photos go near full quality, many photos step down; with videos, photos leave room for them

## In progress / to do (in order)

1. [x] **Job card step-by-step flow** at the top, next step glowing:
   1. I have arrived: record time + GPS location, show "you are here" on the map, distance to the job
   2. Start visit: left the vehicle, read the description
   3. What happened?
      - **Start work**: only by taking the BEFORE photo/video
      - or No access / Refused / Completed by others / Appointment (recorded right there)
   4. Finish work: AFTER photo/video
   5. Photos/videos look good, then finish the job (Work completed / Partial)
   6. Generate the package
2. [x] **My location**: a clear, nice "you are here" marker; the map stays focused on where I am
3. [x] **Photos and videos**: Before photo, Before video, After photo, After video; multiple shots; videos included in the package (Drive, plus email when they fit); photo dates editable (default today)
4. [x] **Map pins**: colors you can read from far away: **blue = new**, **green = completed**, **red = refused**, **grey = no access**, **purple = completed by others**; a different icon per status; the pin you're zooming toward grows and glows
5. [x] **Paperwork page polish**: aligned, neat, follows the procedure
6. [x] **Automatic data checks** after every download: scan every job (description, ITB, address, dates, amounts) and show alerts in the app
7. [x] **ER04964 and the other 4 jobs** (all fixed: ER04964 now shows its real scope from ITB page 3, "Replace defective hydronic baseboard heater cover, approx. 11 LF"; every job has a usable scope). History:: ER05441, ER05941 fixed by the OCR run; ER05421 and ER05733 (plus 4 older jobs) now show their real scope (it sat after "Job Description:" behind a wage-decision page); ER04964: the fetcher re-run picked up the ITB's site-visit instructions instead (also junk); both are now flagged as "no scope" (app blocks the package; type the scope on the paperwork page) and the fetcher re-targets it
8. [x] **iPhone speed**: make the app faster on mobile
9. [ ] **Better app link** (custom domain): needs a domain name from the owner
10. [x] **Test job (master sample)**: TEST-0001, search "TEST" on the map (live)
    - Original request:: one test job that runs the whole flow with sample photos (Sample before 1 and 2, Sample after 1 and 2), sends a sample package, and is the reference for every job card. All real job cards use the same card, so every fix made on the test job shows on all of them
11. [x] **Affidavit/package inside the job card**: review, sign, approve without leaving the card (done: the package opens in a full-screen sheet over the map with "← Back to job"; when it is approved/emailed the sheet closes by itself, the card shows the job as done and a "package approved and emailed ✓" message)
12. [x] **One neat job card**: job → description → steps → status + photos → Job info (due date, amount, tenant with Call, appointment, visits, history, dates) → Documents → More (Outcome form only when tapped, Appointment, Start over, Test); card about 400 px shorter, no overlapping buttons
13. [x] **One master file**: the old map file's useful extras moved into the live job card, then the old file removed (done: the old 53,938-line app/map/MapClient.tsx and its unused styles are gone; its one extra the live card lacked, the original ITB page 3 viewer, is now the "📄 ITB page" button next to the job description, with a link to the full ITB PDF)
14. [x] **Real app on the iPhone**: Add to Home Screen gives "HPD Field" with its own icon, full screen, opens even offline (live). App Store later
15. [ ] Notary stamp prints Chetanpreet Malhi's details: fine while she is the only notary

- [x] Descriptions auto-fixed: the fetcher's page-3 step was crashing on every run (missing pdfplumber) and now fills page-3 scopes (40 added); a junk top pick no longer hides the real scope; scanned ITBs with a junk text layer are OCR'd; HPD's standard notes (photo rules, permits, contacts) are cut off the printed work description

## Next (requested, in order)
1. [x] Package emails itself once the signer and notary confirm (no separate review/approve tap); still viewable after sending; Edit + Update sends the corrected copy
2. [x] Cut steps that should happen automatically: arrival saves itself within 75 m after Go there; notary approval is one tap (the button is the witness statement); the saved signer signature is applied with no tap
3. [x] Photo dates editable (default the day taken): 📅 Before / After date on the job card re-prints the DATE line on every photo of that stage; the before date also sets the affidavit work start; videos keep the recorded label (saved date and thumbnail change)
4. [x] Paperwork page neater: slim top bar (← Map · job), one job summary card, raw status and JSON fields hidden, build buttons under More options when opened from the job card, summary preview collapsed; page about half as long
5. [x] iPhone speed: the map no longer bundles a 2.8 MB copy of every job (Plan my day used it as a fallback); map JavaScript 3.5 MB → 0.83 MB (about 250 KB less to download); pins draw only for what is on screen, date formatters made once; first pins about 4.2 s → 2.45 s on a CPU slowed 4x (about 40% faster)

## How we work
- One item at a time: fix → test (including the real job that had the problem) → push live → screenshot to the owner
- Nothing goes out with a time on it, a blank-form description, or overlapping text
- [x] **Building picture first on the job card** (owner: "so we know where we're going, what the location looks like"): the card opens with the building picture at the very top, then job number and address, then Waze/Google, then the description and steps; the close × sits on top of the picture.
- [x] **No access: 2nd try after 72 hours** (the No Access affidavit needs two tries at least 72 hours apart): the 1st "No access" no longer opens the package or lands in "ready to close out"; the card shows "2nd try from <day>" and the map shows "🔒 N 2nd tries" (amber with "N due" when one is due). When due, the card offers "🔒 Still no access: save 2nd try" (saves the 2nd try date, then the package opens as usual) or "🚪 Got in: start work" (back to the normal work steps, before photos open). A 2nd try before 3 calendar days is refused with the first allowed day.
- [x] **Visit record (proof of each visit)**: every arrival, outcome and "got in" saves where the phone was (GPS, accuracy, feet from the building); "I have arrived" uses the map's live location so it saves instantly. Each package's Drive folder gets "Visit record - <job>.txt": a timeline in New York time (on the way, arrived, each try, work start/finish) with distance from the building, plus photo/video times. Internal only: never emailed, not in the share sheet, never on the affidavit (outgoing documents stay date-only).
- [x] **Plan my day knows what's due today**: a "📅 Due today" box at the top of the planner lists no-access 2nd tries that are due and today's appointments, with "Plan today: due jobs first" (due 2nd tries, then appointments by time, then nearby jobs). Fixed: the planner skipped every follow-up job (so due 2nd tries never got routed), read appointments from a field the card doesn't use (so "Appointments first" found none), and had no borough for the 207 jobs without a borough field (now taken from the ZIP code, as the map does).
- [x] **Saved steps reach the server, and never get wiped** (bug found and fixed): field steps (arrived, outcome, 2nd try, GPS) were only saved on the phone, never sent to the status server; and when the server had any entry for a job (e.g. from a package approval or a Start over), the map's 60-second refresh replaced the phone's entry with it, so the outcome vanished ("Not started yet"). Now every saved job goes into an outbox and its full entry is sent to the server (retried when the phone is back online, on focus and every minute); phone and server entries are combined field by field (newer wins; the phone wins while a send is still waiting); server entries are folded into the phone's copy so nothing is lost either way. Same merge on the package page and the jobs/alerts boards.
- [x] **Photo safety (Drive backup in view)**: photos/videos stay on the phone until the package is sent, and the Drive backup (Storage settings) was off unless turned on there. Now the map shows "☁️ N photos/videos only on this phone · Back up to Drive" while it's off, and every job card with media says either "⚠ only on this phone [Back up to Drive]" or the backup's state ("Drive backup on · last full backup <time>", "Backing up… N parts left", or the backup's error). One tap turns the existing backup on; without Google connected it opens Storage to connect first.
- [x] **Card flow cleaned up, nothing duplicated** (owner: "nothing should be duplicated"): one Waze/Google (in the "Go there" step), one building picture (at the top, with "🔄 360° view" that opens Google Street View facing the building, and "📷 Your photo"), tenant name once, appointment shown once. Steps: Go there → I have arrived → Start visit → Outcome (🔨 Do the work: before photos/video · 🔒 No access · ⛔ Refused access · 👥 Completed by others · 📅 Need appointment). "Need appointment" opens the appointment form right in the Outcome step; the saved appointment shows there and on the status line, and the job waits for it (not closed out). "Change outcome" on the status line replaces the old hand-entry Outcome form; More is now just Start over / Test.
- [x] **Map: new pins and approaching appointments**: teardrop pins in the status color with a white symbol (hard hat new, ✓ completed, lock no access, ✕ refused, calendar appointment, half-circle partial, people done by others) and a chip: days late (amber, red past 30 days), the appointment time ("2:30p", "tmrw"), a countdown within 2 hours ("45m", "now") with a pulsing glow, or "2nd try". An amber map alert shows the next appointment ("📅 Appointment in 45 min · EQ14464 · 2 today"); tapping it opens the job. Appointments today/tomorrow and due 2nd tries stay on the map whatever the status/date filters. Countdowns refresh every minute.
- [x] **Updates reach the phone reliably** (owner still saw the old Waze/Google duplicate): the app now knows which version it was built as. It used to take the server's version as its own, so a phone that loaded the old files from its cache never updated. A newer version reloads by itself when no job card is open; with a card open, a "🔄 New version ready · Update" bar appears. It reloads at most once per version, so it never loops when the old files keep loading (no signal).
- [x] **Appointment without a tenant name**: the form refused to save ("Enter the appointment contact"); the contact now starts as "Tenant" when no name is on file.
- [x] **Updates can't get stuck any more** (owner kept seeing the old card): an iPhone home-screen app is resumed, not restarted, and the old code never updated with a job card open. Now: (1) a new offline helper (sw.js, "hpd-field-v2") reloads any open copy of the app once when it replaces an older helper, which also reaches phones still running old code; (2) the helper and the version are re-checked every time the app comes back on screen (focus, visibility, pageshow), not only on a fresh start; (3) the running version is always shown as a small "v…" tag at the bottom-left of the map. Rule for future releases: bump CACHE in public/sw.js when an update must reach phones running old code.
- [x] **Live deploys fixed** (the phone sat on the Oct 4 version for a day): the Cloudflare project is connected to GitHub, its own builds failed, and our uploads were filed as previews. Cloudflare's own Git builds are off, main is the production branch, and every deploy now checks that the live address serves the new version (and that the calendar function answers), failing loudly if not. Manual workflows: "Check live version", "Fix Cloudflare deploys".
- [x] **Appointment reminders with the app closed**: next to a saved appointment, "🔔 Add to Calendar" puts it in the iPhone Calendar (served by /api/appointment-calendar, so iPhone shows "Add to Calendar") with alerts 1 hour and 15 minutes before (or the chosen reminder + 15 min), the address for Maps, the tenant's name/phone/notes, and a link that opens the job card. Works for requested and confirmed appointments. The old hidden download button is gone.
- [x] **End-of-day summary**: map menu → "Today's summary": counts (visited, finished, no access, refused, appointments booked, packages emailed), today's jobs in the order they happened (arrival time and distance, outcome, 2nd-try date, appointment booked, package emailed), jobs ready to close out, and tomorrow's appointments and due 2nd tries. Tap a job to open its card. "✉️ Email it to me" sends it through the same route as packages (only to the owner's configured address); "Share" opens the iPhone share sheet.
