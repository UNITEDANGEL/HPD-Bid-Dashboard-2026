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
13. [ ] **One master file**: the old map file's useful extras moved into the live job card, then the old file removed
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
