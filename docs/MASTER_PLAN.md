# HPD Field & Bid App: Master Plan

Owner: United Angel Construction Corp. Written from the owner's requests in the October 2026 build
conversation. This is the plan we follow and keep building on.

**How every item is done:** test it the way the owner uses it (real buttons, iPhone size, TEST-0001
first), check every number against real data (HPD Open Data, Gmail, the job files), push to main
without asking, and show the live app. Keep the repo on D:. Never send anything real (fax, email) without
the owner's tap. Dragon / ForexAgent is a separate program: never mixed in here.

---

## What the owner asked for (this conversation)

### Invitations to bid
- See every invitation still open, today and the coming days, on the map; pick the day with small
  buttons by "Invitations to bid / Back to jobs": Today, Tomorrow, Day after, All; show due times
  (many are due at 3 PM) and more information.
- Read new invitations through the day, not only at night (they arrive morning to evening).
- The job card for an invitation: the complete job description, big and easy to read, nothing missing,
  including HPD's notes and contacts.
- Save price, review the package (price on page 1, page 2 and the Work Description Form), send by fax to
  2128638655@humblefax.com; verify it was sent; resend if it failed.
- After sending: the map shows it was sent with the price. Separate colors: going through (pending),
  confirmed by HumbleFax, failed. Buttons must show they were pressed and each step must be recorded
  in the job card (bid history).
- "Start bidding" button: the app then watches the faxes of the day, counts them, and warns about any
  bid due today that isn't sent ("this is due at 3 PM, why aren't we bidding?").
- Revise a sent bid: old price crossed out, new price next to it with initials and "revised 1x on date";
  cover says to disregard the old price.
- The bid list panel can be hidden to see the map.
- Never miss one: the count must match the inbox (13 Oct: 18 invitations arrived; keep re-checking).
  Invitations and award emails arrive 7 AM - 7 PM (705 of 706, Jun-Oct 2026): check every 10 minutes
  6:30 AM - 7:50 PM, from the cloud, not only from the laptop.
- The job description big and clear (bigger text, A+ for bigger still, numbered items on their own lines).
- Once a bid is sent it's gone: locked. The only way to change it is "Revise this bid" (old price crossed
  out, HPD told to disregard it). Every step saved and logged.
- A simple home screen: only what's used, with real numbers; the rest one tap away.

### Prices and winning more work
- Read the complete description before suggesting a price: all items, quantities, sizes, units.
- Use HPD's data: what every invitation was awarded for, whoever won; compare with history.
- Know which jobs we bid and lost and for how much they were won.
- Win rate up and more profit: where to price higher, where others win cheaper, by kind of work and area.
- Units matter: lead abatement (DELEAD), AEP, ERP / regular.
- Learn from the owner: the owner's own price and reason for each kind of work (e.g. Secure-Tech lock
  and buzzer ~$2,000) become the starting point next time.
- All historical data: whole year, then the year before if needed.
- Read the description carefully: 1 door vs 2 doors, a new door vs a lock / hinge / closer on a door,
  sq ft, cubic yards of rubbish; the price follows the size.

### Work orders (jobs)
- The award date always on the job card (it's the most important date); work start and work completion
  (maturity) dates for every job.
- Daily report: jobs awarded in the last 30 days, pending, overdue, due soon, what to follow up.
- The map should focus on maturity / overdue, plus the 30-day view.
- Many jobs show no status: recover the status from what was sent to HPD (affidavit / invoice emails)
  and from HPD's own closing reason; catch up the whole year.
- Pin icons that show the status, so finished jobs aren't visited again.
- Paperwork dates: award date and HPD due dates are fixed; editable until sent: work started, work
  completed, no-access dates, refused date, completed-by-others date. The notary date is the last event
  date (work completed / 2nd no access / refused).
- Once paperwork is sent the job is locked; a job can be revised (e.g. no access, then access later),
  keeping the old version.
- Everything saved in a master file.
- Follow-up report sorted right: what's due / just overdue on top, 200-days-overdue at the bottom.
- Status from the emails: what HPD staff asked for (affidavits, invoices, photos, videos, status) and what
  was emailed to them, not only the paperwork address.
- The owner's chat (WhatsApp) has job updates: read it and match by OMO (display only, never overwrite).

---

## Done (live)

- Invitations: map, bid sheet, full description + HPD notes, save / fill / fax, revise with crossed-out
  price, fax status colors, bidding session with alerts, bid history log, hide-the-list, read 8 times a day.
- Faxes confirmed from HumbleFax's emails (fax checker, only while bidding); missing faxes recorded.
- Price help from 3,682 awarded invitations + 1,421 of your award emails; units (lead / AEP / ERP);
  Easy wins, Should have bid, prices vs the market, price history and win rate by month, History tab,
  learning from your prices.
- Paperwork notary date = last event date; work-completed date from the field record.
- HPD's closing reason for every job and the paperwork you sent HPD (Sent mail), nightly.
- Job status recovered for all of 2026: pins show "HPD ✓" / "sent ✓"; job card key dates (award, start,
  complete by, days overdue); invitation day buttons (Today / Tomorrow / day after / All).
- Follow-up report (map button) with overdue / due this week / awarded 30 days / waiting on HPD / closed
  at HPD; the same as a map filter; in the evening email (due this week + oldest 15 overdue).
- Paperwork lock: once sent to HPD the job is locked (job card banner, no outcome change / clear / start
  over; paperwork page shows the sent version read-only). "Revise paperwork" asks why, keeps the sent
  version (outcome, dates, approval, email, Drive link) in the job's record, and opens the job again.
- Master file: every job (details, everything saved from the phones, HPD status, paperwork sent, follow-up),
  every bid and the session, in one record. Readable copies in OneDrive "HPD Master File" (one per day);
  encrypted copy in the repository (public repo: never plain), every night's version kept; restore tool
  puts back only missing / older entries on the status server, never deletes.
- Price help reads descriptions more carefully (13 Oct): new door vs door hardware read sentence by
  sentence ("replace door passage lock / strike plate / closure" is hardware, "replace the hopper door
  with fire rated hopper door" is a door); door counts from numbered lists and "both doors"; plural
  windows; every Secure-Tech spelling HPD uses; cubic yards and sq ft scale the price. Tested only on
  jobs before each one (1,587 awards): typical miss 18.6% -> 17.6%, single-item jobs 18.0% -> 16.7%.
- Invitations never dropped silently (13 Oct): the banner shows how many arrived today (compare with the
  inbox) and a red warning lists any invitation PDF that couldn't be read (no OMO # / bid due date).

- 13 Oct (evening): simple home screen (invitations open / due today / arrived today, map, paperwork,
  stats; old dashboard at /overview/); invitation card: bigger description, numbered items on new lines,
  sent bids locked with "Revise this bid" (logged); follow-up: "HPD asked for paperwork" first (HPD staff
  emails, 901 OMOs since Nov 2025), overdue most-recent first grouped 1-30 / 31-90 / over 90 days,
  paperwork emailed straight to HPD staff now counts as sent (+74 jobs, overdue 147 -> 124).

- 14 Oct: your real win rate from the 1,926 bids you faxed since Nov 2025 (price read from each package;
  matched HPD's award on 570 of 622 wins). Won 622 of 1,541 awarded (40%); last 3 months 25% (before 41%).
  Lock / latch prices went from ~$490 to ~$970 in Aug-Oct while winners stayed ~$600-730. 131 times you were
  the lowest and lost (4 of the 41 checked were late). Bid stats page: totals only; prices stay private.
  HPD worklist: who asked (J. Lewis is the vendor tracker since 12 Oct; K. Atkins; D. Gafur AEP) and what.
  OMO numbers before "_" in file names were missed by the email readers: +52 jobs with paperwork sent.

- 14 Oct morning: faxes couldn't be sent ("Drive connection failed", then "Sign in again"). Cause: the
  old status server read Cloudflare KV once per job on every phone refresh and used up KV's free daily
  reads ("KV get() limit exceeded for the day"); Google sign-ins were stored in the same KV. Fixed for good:
  the Google sign-in is an encrypted cookie on the phone (no KV); the status server reads KV once per 20 s
  and serves its last good copy when KV is over the limit; iPhone Send/Revise use two taps (Safari blocks
  pop-up boxes); a red "Reconnect Google" bar shows when Google isn't connected; failed sends are logged.
  Optional insurance: Cloudflare Workers Paid ($5/month) removes KV's daily limits.

- 15 Oct: multi-door prices tested on 1,371 past awards. Predictions run low as door count grows
  (x1.09 at 2 doors, x1.52 at 6+). Fixes tried (stronger scale-up, pricing from jobs with the same door
  count) removed the bias but made LESS money with the best price ($893-897k vs $900,683; multi-door
  $150-154k vs $157k): best price already bids just under past winners. Not shipped. Multi-door misses
  are mostly job-to-job variety, not a fixable bias.
- 15 Oct: PIP: payments page (7 stale-dated checks $24,715, 21 disbursed not paid), paid / not paid per
  job (3,320 OMOs), 2024-25 jobs layer (1,199 jobs, HPD Open Data + PIP), older rejected jobs (2021-2025).

## Now (in this order)

0. **Why the lowest bid lost** (131 jobs): check against HPD's poor-performance / paperwork notices and fax
   receipts; ask HPD about the clear ones.
0. **Lock / latch pricing**: back toward the market (~$600-730) where the job is a plain lock.
0. **Multi-door prices** are still the weakest (typical miss 22%): read "per door" / "each" amounts and
   jobs that mix a new door with hardware on other doors.
1. **"My cost" floor** per kind of work.
2. **Win rate from sent bids** (your price vs the winner's on jobs you actually bid).

3. **2025 jobs**: recover statuses for last year's jobs too, if needed.

## Done 15 Oct 2026
- **Job status line** on every job card: Awarded -> Work done -> Papers sent -> HPD closed -> Paid,
  green / amber / red per step, plus "Next: ..." (lib/job-stages.ts, scripts/test-job-stages.mjs). Uses the
  job's outcome and dates, the package approved / emailed, Sent mail, HPD's closing reason, open HPD
  rejections (red) and PIP paid / $ open. A date recorded after the papers went out shows "recorded <date>".
- **Bid pins stay on their building when zooming**: a CSS rule (position: relative on .fc-bid-pin) was
  overriding Leaflet's placement and pushing each pin down by the ones before it. Removed; checked all 19
  pins against their coordinates at zoom 10 and 14 (under 1 pixel off).
- **360° Street View + Map & photos** buttons at the top of every invitation (Google Maps links, no key).

- **Building facts on every bid** (lib/building-facts.ts, app/field-command/BuildingFacts.tsx): year built,
  floors, walk-up / elevator, apartments (PLUTO), open HPD violations by class, and up to 3 open violations
  that match the bid's work, ranked by how closely they read like the bid (usually the violation behind the
  OMO), with a link to HPD Online. Free NYC Open Data, read from the phone, kept 12 hours. Checked on all 19
  open invitations. Tests: scripts/test-building-facts.mjs, scripts/test-browser-building-facts.mjs.
- **No more "Loading jobs..." after an update**: if an app file is missing right after a deploy the page
  reloads by itself (at most twice in 5 minutes). Test: scripts/test-browser-update-recovery.mjs.
- All-buttons test updated (dashboard is at /overview/, nyc.gov links allowed): 17 pages, 76 links, 64 buttons.

## Ideas for the bid flow (proposed 15 Oct)
- Later: use building age / walk-up in the price advice once a backtest shows it pays.
- One-screen fill order: look (Street View) -> read description -> price (best price shown) -> Fill ->
  check -> Send (two taps).

## Done 16 Oct 2026: colorful map buttons (owner picked style C)
- Round colored bubbles with the label underneath (Route teal, Today blue, Stats purple, Notices red with a
  bell, Follow-up amber, Bids coral, Map green, Locate gray); count badges on the bubble.
- Press (or hover with a mouse) zooms the bubble and shows a callout with the full name ("HPD notices:
  rejections and requests") so you know what you're about to tap. Checked: no overlaps in portrait or
  landscape (the route bar stops short of the buttons sideways).
- Sent-mail correction dates (32 jobs), high-price warning, last-30-days scorecard (see above).

## Rule: read the WHOLE job description (owner, 16 Oct 2026, ER07755)
Big jobs continue past page 3. ER07755 has 10 door items: 1-7 on page 3, 8-10 and "TOTAL = 10" on page 4
(under a wage-rate header). Always read page 3 plus every following page up to HPD's bid form
(scripts/itb_text.py, used by the invitation reader, the awarded-job reader and the price history), show
all those pages in the bid card ("continues on page 4"), and count every item.
- Also: HPD wrote "TOTAL WINDOWS = 10" under a list of doors: with no window work, those are doors
  (lib/bid-price.ts). Items written with ".." between phrases count as doors when they name a door or its
  hardware. Backtest (all awards since April): same wins, +$522 (multi-unit jobs 128 -> 129 wins).
- 7 of 745 invitations so far had numbered items on page 4.

## Done 16 Oct 2026: corrections really work on the owner's phone
- **Preview button was greyed out on the iPhone**: every rejected job's paperwork had been sent, so the page
  was "locked" (the sent version can't be changed by accident). A correction is a new version: the lock no
  longer applies in correction mode. (Tests passed before because the test phone had no sent paperwork; the
  correction test now seeds the job as sent.)
- **No signature pad or notary approval on the correction page** (signed by hand, see the rule).
- Older jobs: HPD's closing reason (now fetched for 2021-2025 jobs too, scripts/update-hpd-job-status.mjs)
  picks what happened; otherwise the correction box asks ("What happened on this job?"). Missing award
  amount comes from PIP (paid + still open) or HPD's award amount.
- **Dates on corrections are never "today" by default** on an older job: the correction box has the date
  fields for the outcome (work dates / access attempts + calls / refusal date + person / date found done)
  and refuses to make the preview with today's date.
- All open rejections tried one by one (node_modules/.cache/all-fixes.mjs): what each still needs is listed
  in the notices (dates / what happened only the owner knows).

## Privacy plan (owner said yes, 16 Oct 2026)
Tenant names/phones are public: 745 invitation PDFs (page 2) and the tenant fields in
public/data/COA_Fetcher_2026.json (339 names, 14 phones), committed by the fetcher.
1. New secret HPD_PRIVATE_DATA_KEY (GitHub secret + Cloudflare Pages secret, set by a workflow).
2. The fetcher encrypts the invitation PDFs and the tenant fields (AES-GCM) before committing; plain copies
   are no longer committed.
3. A signed-in route (/api/private/..., Google sign-in cookie) decrypts them for the app: bid pages, bid
   fill, job card tenant name/phone, paperwork phone dates.
4. Remove the plain files from the site, then (last, cannot be undone) rewrite git history to drop them and
   force-push main, with the fetcher paused during the rewrite.

## Owner's standing requirements (keep upgrading until it's perfect; follow this list)
Collected from the owner's requests; every change is checked against these.
1. **Works on the iPhone in both directions.** The owner now uses it sideways (landscape): every screen
   must use the full screen, every button reachable, nothing covered. Tested at 844x390 and 390x844
   (scripts/test-browser-landscape.mjs).
2. **Buttons toggle.** Tap Bids / Notices again to close; there is always a way back to the map
   (Back to jobs, the 🗺 Map button on an open bid, Close on every sheet).
3. **HPD notices first.** Every notice opens and scrolls; each rejection can be fixed **individually**
   (Fix & resend per notice) with a **full preview** before anything is saved or sent.
4. **Everything gets a nice preview.** Paperwork, corrections and invitations show the actual pages as
   pictures before any action (correction preview with HPD's reason; invitation pages 2-3).
5. **Invitations: see the real job description.** HPD's own pages (actual images), tap to enlarge/zoom,
   plus the building (Street View, facts, violations) and the earlier jobs at the same building next to
   the price.
6. **Corrections are signed in ink** (no signature pictures; notary stamp kept; notary date = day of the
   correction) and saved to print later (see the rule above).
7. **Accurate, real data only**; test like the owner (real taps, iPhone size, real numbers); push verified
   changes to main and show the live result.

## Done 15 Oct 2026 (evening)
- **iPhone landscape**: a desktop-only "phone frame" rule was shrinking the app to 390 px when the phone is
  sideways (wider than 700 px), and the map buttons ran off the bottom: Notices / Bids / Map / Locate could
  not be tapped. Now the frame is for computers only; sideways phones get the full screen, the map buttons
  in two columns, the search and chips stop short of them, bids and the job card as left side panels.
- **Bids button toggles** (the bids panel no longer covers it); Notices opens from the bids screen; a second
  tap on Notices shows all jobs again; an open bid has a **🗺 Map** button (centres the map on it).
- **Earlier jobs at the same building** next to the bid price: winning price (what HPD paid), won or not,
  kind of work (same work first), your price when the app sent the bid (lib/building-bids.ts; public award
  data only, no private bid prices).

## Next on the plan
- Invitation pages: load faster (keep the drawn pages on the phone) and show them in the bid list too.
- Notices: per-notice preview of HPD's own email/PDF inside the app (not only the Gmail link).
- Measurements read from the description ("30x26 glass", "TOTAL WINDOWS = 3") into the price.
- Correction dates filled in automatically from the paperwork originally sent (Sent mail PDFs), so older
  jobs don't need dates typed by hand.
- One fax for several bids due today.
- Tenant data out of the public repo (needs the owner's OK; see Owner decision needed).

## Rule: HPD rejection corrections (owner's instruction, 15 Oct 2026)
- Corrected paperwork is **printed and signed by hand**: the owner signs the affidavit (page 2) and the
  invoice's "Signature of Principal" line in blue ink, and the notary signs in ink. **No signature
  pictures** on a correction. The **notary stamp stays** and the **notary date is the day of the correction**.
- Always **preview first**: nothing is marked corrected until the owner checks every page against HPD's
  reason and taps "It's right: save to print". Saved corrections wait in HPD notices -> "Corrections to
  print" (on that phone) until printed, signed, notarized and sent ("Signed & sent", two taps).

## Done 15 Oct 2026 (afternoon)
- **HPD notices scroll again**: the list had no scrolling area (unstyled body); now it scrolls and the map
  can't grab the swipe.
- **Corrections work for older jobs**: jobs awarded before Aug 28, 2026 need HPD's earlier affidavit
  (12.2024 Rev. 01.21.2025); the app used to stop ("legacy mapping not verified"), so almost no correction
  could be made. Clean copies with named boxes: public/templates/*-2025.pdf (scripts/build_legacy_affidavits.py;
  box 4 = award date per the old filler). Signature / notary / stamp positions measured for those pages.
  Checked by rendering real corrections (EQ17038 work, EQ13174 no access).
- Correction flow: preview -> check (HPD's reason shown, ink reminders) -> save to print -> Corrections to
  print in HPD notices -> open/print -> Signed & sent. Messages now show next to the button (they were
  1,800 px above it, so the tap looked dead). paperwork.css was never loaded; now it is.
- **Invitation pages in the bid card**: HPD's pages 2-3 (job description) drawn from the invitation PDF;
  tap for full screen with zoom (1x/2x/3x); "All pages" for the whole invitation.
- Tests: scripts/test-browser-correction.mjs (+ both form versions in test-complete-package.cjs).

## Owner decision needed
- **Tenant names/phones are public**: 745 invitation PDFs (page 2 has the tenant's name and phone) are in the
  public GitHub repo and on the open site (public/documents/itb, committed by run-fetcher.yml). Fix: keep
  them private (Drive / signed-in function), stop committing them, and clean them out of git history.

## Open items for the owner
- **Invitation timer in Cloudflare** (13 Oct: the laptop battery died at 2:58 PM, 3 invitations waited
  2 hours; GitHub's schedule only runs ~once a day). Code is ready (cloudflare-timer/, every 10 min,
  7 AM-10 PM). To turn it on: (1) Cloudflare API token: add Account > Workers Scripts > Edit;
  (2) GitHub: fine-grained token for this repo with Actions: Read and write, saved as repository secret
  FETCH_DISPATCH_TOKEN; then Actions > Deploy Invitation Timer > Run workflow.
- GitHub secret MASTER_FILE_KEY (the key in OneDrive "HPD Master File/MASTER_FILE_KEY.txt") turns on the
  nightly encrypted master file; until then it's written when run on this PC.
- Google reconnect with "read email" lets the phone confirm faxes by itself (the fax checker covers it).
- Status-server worker deploy needs Cloudflare Workers permission on the API token.
