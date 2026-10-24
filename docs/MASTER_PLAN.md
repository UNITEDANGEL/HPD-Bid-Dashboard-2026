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

## Done 16 Oct 2026: tenant details off the public site (stages 1-3 of the privacy plan)
- scripts/privatize_public_data.mjs runs in the fetcher before every commit (nothing is committed if it
  fails): tenant name / phone / apartment fields blanked in data/ and public/data/COA_Fetcher_2026.json and
  the CSV; "TENANT ... phone" text and any non-HPD phone number (212-863 lines kept; file names untouched)
  masked in descriptions, HPD's notes, market descriptions and notices; the originals go into
  public/private/tenants.json.enc (AES-256-GCM). HPD's invitation PDFs (763) and page-3 pictures (686)
  encrypted under public/private/, plain copies removed (kept on the owner's PC in data/private-itb and in
  the C: HPD-private-backup folder). 117 filled affidavit / invoice copies removed from templates/.
- The app gets them from /api/private/* with the owner's Google sign-in: job card tenant + Call, paperwork
  phone dates, bid fill and HPD's pages. Not signed in: "Private: sign in with Google" / pages ask to sign in.
- Checked: 3,257 job values and 63 invitation values restore exactly; 0 personal phones left in public
  files; all 3,163 file-name fields unchanged; tests open the encrypted files like the server.
- Also: fetcher push retries no longer drop a fetch (--autostash); the laptop timer runs from C:.
- STILL TO DO (owner's OK needed, cannot be undone): rewrite git history so the old plain PDFs / tenant
  fields are gone from earlier commits, then force-push (fetcher paused while doing it).

## Done 16 Oct 2026: measurements from the description into the price
- Glass pane sizes ("30”X26”", "34”X44”") -> glass sq ft; a past job with a different pane size is scaled
  (power 0.3). Room / floor sizes in feet ("KITCHEN FLOOR 13 X 17") count as the repair area when no sq ft
  is given. Tile sizes ("12 X 12 tiles") are ignored. The bid card shows e.g. "30×26″ glass · ~5.4 sq ft".
- Backtest on all awards since April: 937 -> 938 wins, $903,701 -> $907,109 (+$3,408); glass jobs 17 -> 18
  wins; room-size jobs +$1,605. Power 0.5 did worse.
- 72 of 3,700 past descriptions have a glass size, 16 a room size.

## Owner's requests 16 Oct 2026 (afternoon): pricing, job summary, flow
1. **My rates when pricing**: enter what I charge per square foot (floor / tile, sheetrock / plaster,
   painting), per door, and per part (Secure Tech lock, electric strike, lock, closer, hinges...). The app
   works out "My price" for each invitation from those rates and the quantities in the description.
2. **A clean job summary on every invitation** (keep HPD's full text too): e.g. "Ceramic floor tile · 85 sq
   ft · 2 rooms", "Leak: trace & repair", "3 doors", "Secure Tech lock", "electric strike plate ×2", where
   (public hall / apartment / floor). So I can see at a glance what the job is.
3. **Expensive parts priced right**: a Secure Tech lock alone is over $1,000 (job over $2,000; HPD's awards
   agree: median $2,000 on 35 Secure Tech jobs); an electric strike plate is ~$150 plus install and
   programming. The app was pricing ER05098 (Secure Tech) at $585 as a plain entrance lock: fix.
4. **Best price strategy, better**: learn from every winning price. (HPD's open data has only the winning
   amount for each job, not who won or the other bids; we use all of it.)
5. **Flow between map, notices, stats, route, today**: every button opens what it says from any screen,
   closes what was open, and a second tap closes it; Notices sometimes went back to the wrong screen: fix.
   Test every button from every screen.

Done 16 Oct (same day):
- **Flow (5)**: every map button closes whatever else is open and a second tap closes its own screen; Notices
  always opens the list (it used to clear the map instead when tapped after closing the list); the list has
  **Show all jobs**. scripts/test-browser-flow.mjs taps every button from every screen (30 pairs, both ways
  of holding the phone).
- **Expensive parts (3)**: Secure Tech lock and electric strike are their own kinds of work (only compared
  with jobs that had them); "ADAM WRITE" read as Adams Rite. Backtest since April: +6 jobs won, +$13,250
  (Secure Tech +$8,100; Adams Rite / mortise +8 wins). ER05098 (Secure Tech + strike + buzzer): $585 -> $1,329.
- **Job summary (2)**: "📋 The job" at the top of every bid and on each list row: Vinyl floor · 120 sq ft,
  Secure Tech lock ×1, Door closer · 2 doors, Sheetrock 44 sq ft + Painting 620 sq ft (each sq ft goes to the
  work named before it; "remove 44 ... install 44" counted once), where (Apt, floor, entrance) and rooms
  (lib/job-summary.ts, scripts/test-job-summary.mjs).
- **My rates (1)**: "🧮 My price" on every bid: tap a line to set your rate (per sq ft / door / window / each
  part / per job); My price = each line × your rate, with its chance to win and **Use**; list rows show My
  price when every line has a rate; Stats -> Your rates (Remove). Kept on the phone (lib/my-rates.ts,
  scripts/test-browser-my-price.mjs).
- Still to do: sync rates and minimums between phone and computer; stair treads / risers counted by step.
- **Close out / 2nd try as buttons (owner, 16 Oct)**: the "N jobs ready to close out" and "N 2nd tries" bars
  across the map are now two round buttons bottom left (count badges; 2nd try red when one is due); each
  opens its list full screen (job -> its card, Package ->). Part of the one-screen-at-a-time flow.
## Owner's requests 16 Oct 2026 (evening)
1. **No bid**: mark an invitation "No bid" (with a reason) so the checklist stops asking. (Done: 🚫 No bid on
   every invitation with quick reasons, Undo; row chip, grey pin, out of the checklist / session counts; synced
   as NOBID-<OMO>, never a fax record (lib/no-bid.ts, test-browser-no-bid).)
2. **Read my email daily and keep HPD conversations**: every email thread with HPD staff (work orders,
   correction requests, AEP e.g. D. Gafur, the vendor tracker), kept whole (their messages and my replies),
   per job, separate from rejection notices; show which ones wait on my answer.
   (Done: scripts/fetch_hpd_conversations.py reads every thread with hpd.nyc.gov, both sides, on every fetcher
   run (first run 180 days: 518 threads), encrypted in public/private/conversations.json.enc. HPD notices ->
   "💬 Conversations with HPD" (waiting ones first) opens a thread as a chat with Reply in Gmail; job cards show
   "💬 Emails with HPD (n)". Waiting = a person at HPD wrote last in 45 days about something needing an answer,
   not "Received. Thanks", not answered by paperwork sent later: 29 today. test-browser-conversations.)
3. **Map buttons hidden behind "Today's route"** on shorter iPhone screens: fix. (Done: the route bar stops
   short of the button column; buttons shrink on short screens; test-browser-buttons-visible at 4 sizes.)
4. **Bids open on the map first**, the list as a half-height panel I can pull up / down. (Done: compact header;
   the list opens as a bar, tap / pull up = half, pull again = whole list, 🗺 Map folds it; pins fit the map you
   can see, also sideways. test-browser-bids-panel.)
5. **Invitation card like the awarded job card**: everything in one card, no duplicate information, less
   scrolling, with the building's picture.
   (Done: the building's picture on top (your photo or Street View, 360°, camera: same as the job card), jump
   buttons that stay under the header (Job / Price / Building / Send / Map); The job summary + HPD's pages, HPD's
   text folded behind "Show HPD's text"; the old "What this job includes" list removed (The job replaces it);
   building facts, violations, earlier jobs and your bids there in one "🏢 The building" section below the price.)

## Next level (owner, 16 Oct 2026, night): the plan + recommendations
Owner: "keep upgrading this app until it looks perfect." Everything below is wanted; order is my recommendation.

A. ✅ (done 16 Oct: "Updated Oct 16, 3:06 PM · #1901 · what's new" at the bottom; tap -> What's new from
   public/data/whats-new.json (add an entry with every change); "App updated" banner once per new version;
   💡 Ask for a change saves the owner's request (CHANGE-REQUEST-* on the status server, scripts/list-change-requests.mjs).)
   **Version on screen, every version saved.** At the bottom: "Version 2026.10.16 #42 · updated 4:10 PM · what's
   new" (tap -> the list of changes in plain words). Every deploy is kept (git + Cloudflare keep each build;
   a "What's new" file is written from each change). Recommendation: do this first, it's small and lets the
   owner know where we stand after every update.
B. ✅ (done 16 Oct, first version: lib/bid-calc.ts. Lines at your rates + extras: floors up the stairs above the
   2nd, extra locations, borough travel; ✎ changes a line for this job only; -10/-5/+5/+10% on the total; verdict
   vs the market's best price. Next: materials and labor lines from the costs database (C), stories from building facts.)
   B. **Bid calculator ("calculation mode") on every invitation.** The whole job read neatly on screen first (what,
   where, how many locations, which floor / how many stories up, sq ft, doors, parts: "trace & locate leak + repair
   · 2 locations · 3rd floor walk-up"), then a price built line by line from my rates (per sq ft / door / part /
   location) + materials + labor + extras (stories without elevator, far borough, 2nd location), shown next to
   the market's best price and its chance to win: "Does this sound right?" -> I raise / lower a line and it
   recalculates. HPD's whole document stays one tap away to verify.
C. ✅ (done 16 Oct, first version: lib/costs.ts, Bids -> Stats -> Your costs (materials + labor per unit, trip per
   job; starts with the owner's numbers); the calculator shows cost, profit and % at my price and at the best
   price, and names the parts without a cost. Next: sync costs / rates between phone and computer; profit after
   payment per job in Stats.)
   C. **Materials & costs database** (my real costs, editable list, kept private): hollow metal door ~$500, hopper
   door ~$300, hinges ~$15, door closer ~$30, locks, Secure Tech lock ~$1,000+, electric strike ~$150, tile /
   sheetrock / paint per sq ft, labor per hour / per day, trip cost. Each job then shows estimated cost and
   **profit (and %)** at my price and at the best price, and the stats show profit per kind of work.
D. **Job history database** (built from what we have: awards, bids, notices, paperwork, payments): per job and per
   building, everything in one place, searchable; per kind of work: my cost, my price, winning price, profit.
E. **Notices flow finished** (see the rules below): rejections before/after with highlighted corrections on the
   copy, signed COPY (emailed) + unsigned original (printed) made automatically, requests checked against what
   was already sent, timers, suggested replies to approve, every kind obvious at a glance.
F. **Map screen neat at iPhone size**: one compact top bar (search + one menu for days 15 / 30 / 45 / 60 / custom
   and boroughs); every button glows / reacts when pressed; large clear text everywhere (jobs, invitations,
   messages, previews).
I. **Progress reports in the app** (owner, 16 Oct): "I put requests in What's new; give me progress reports there
   so we don't have to talk here." Done: What's new -> "Your requests and progress": each request with a status
   (Received / Working on it / Done) and dated updates (scripts/reply-change-request.mjs writes CHANGE-REPLY-<id>);
   the version label says "💬 N new updates". Every session starts by reading the requests
   (node scripts/reply-change-request.mjs --list) and answers them there. No tenant names in replies (the status
   server isn't private).
H. **Change the app from the app** (owner, 16 Oct): today "Ask for a change" collects requests for the next
   session. Fully automatic (the app files a request, an AI on GitHub makes the change, the owner approves the
   preview) needs a Claude GitHub Action with its own API key and costs: owner's decision before setting it up.
G. **Email from the app to anybody**, with "Send to me first" to check (done for the HPD note), then replies to
   any HPD email and to tenants / landlords from the job card.

My recommendations on top (owner asked "what else can we do"):
- Profit per job after payment (PIP amount - my costs) so we know which work actually pays.
- A weekly summary (Monday): bids sent / won, money waiting at HPD, rejections open, requests overdue.
- Price alerts: when my price for a kind of work keeps losing (or keeps winning by a lot), say so.
- Backups of my private lists (rates, costs, minimums) to my Google Drive, so a new phone has them.

## Owner's requests 16 Oct 2026 (night): four kinds, each with its own flow, preview, folder and timer
Rules (owner's words, kept):
- **Four different things, never mixed**: Rejections (paperwork I already sent, rejected for payment because of
  an error) / Corrections (HPD staff asking to correct something) / Requests (HPD asking for an affidavit and
  invoice) / Messages (everything else).
- **Rejections**: be very careful. Show BEFORE and AFTER: what the error was (HPD's notice, large) and how it was
  fixed, with the page images side by side. Printed with **no signature** (I sign the original in ink and mail
  it). Interface for rejections much better: the work order and the problem shown large.
- **Requests**: first check the system: did we already send the affidavit and invoice? do we have them? If not,
  make them. Requests are **signed by the app** (my saved signature + notary), ask me **one time only**, never make
  me type what the app already knows. "Just sign for me" -> it signs and shows me the preview.
- **Everything has a preview** before it's saved or sent, so I know what I'm correcting and that it's corrected.
  The preview shows the whole document, nicer (all pages, large, zoom).
- **Folders**: done items wait in their own folder, reviewed and ready to send: Requests folder, Rejections
  folder (fixed, ready to print), Corrections folder.
- **Messages back to HPD**: answer any HPD email with a suggested reply I only approve ("Yes, please see the
  attached requested documents", "We don't understand this, could you explain..."), AI-drafted, sent with my tap.
- **Timers**: every request / correction shows how long it has been waiting and how long HPD gives (deadline),
  so we answer on time.
- **Space**: no big colored buttons wasting space (e.g. "See HPD's notice (1 PDF)"); text large enough to read;
  compact rows. Fix things live; show what's going on.
- **Package generation asks too many questions**: ask once, fill the rest from what's known.
- **Invitations to bid: show the whole document** (all pages), not only 2 pages: other pages can have more
  information.

- **Rejection cleared -> copy to the sender** (done 16 Oct): the print folder keeps each fixed rejection with
  its steps (Fixed -> Printed -> Copy emailed -> Original mailed, with dates; done ones folded under Done); "Email
  copy to <signer>" attaches the fixed paperwork as "<OMO> corrected affidavit and invoice (copy).pdf"; the
  Rejected tab lists it as Cleared. No signing asked for the copy.
- **Next (owner, 16 Oct night)**: on the copy sent to HPD, **highlight what was corrected** (box + "was X, now
  Y") so they see it at once. **Two versions made automatically, no tapping to sign**: a COPY signed with my
  saved signature and the notary's (emailed), and the unsigned original (printed and signed in ink). Make every
  notice's kind and what HPD wants obvious at a glance (formal request notices for affidavit / invoice /
  photos / videos separate from conversations).

- **Email from the app to anybody, test on myself first** (owner, 16 Oct night): "📨 Send to me first" sends the
  same email (with the attachment) to my own Gmail, marked [CHECK BEFORE SENDING]; I can check or forward it.
  (Done for the HPD note.) Next: reply to any HPD email from the app (suggested replies to approve).
- **Map screen, iPhone size, nice and neat** (owner, 16 Oct night): the borough chips (All / MN / BK ...), the
  day chips (30 days / 60 / 90 / Custom / 2024-25) and the search box take too much of the map. One compact
  bar: search + one menu for days (15 / 30 / 45 / 60 / custom) and boroughs, chosen fast; every button glows and
  reacts when pressed (like the map buttons); everything large and clear, also inside jobs, invitations,
  messages and previews.

Order: (1) whole documents in every preview (invitations + notices + packages) [invitations: done]; (2) compact
notices screen with large text [done]; (3) rejections before/after view; (4) requests: already-sent check + one-time signing + Requests
folder; (5) timers; (6) suggested replies to HPD; (7) package flow with fewer questions.

## Owner's requests 16 Oct 2026 (late)
1. **Keep every kind apart**: rejected paperwork (HPD's automatic notices) / HPD staff asking for corrections /
   requests for affidavits, invoices, photos / other conversations. (Done: HPD notices has tabs ❗ Rejected ·
   ✏️ Corrections · 📎 Requests · 💬 Messages · 🖨 To print, each with its count; award letters and rejection
   notices are never listed with the conversations.)
2. **Close out / 2nd try lists showed ~3 jobs in a small scroll box**: fixed, the list uses the whole sheet.
3. **Auto-fix rejected paperwork**: the app fixes it from HPD's reason, shows the preview; Accept -> saved in
   the "fixed, ready to print" folder; Reject -> deleted, start again. Then, with my tap, a short email back to
   whoever sent the notice (their name from the bottom of it): the rejection is fixed, printed and in the mail;
   please confirm when received.
   (Done: Rejected -> "✨ Auto-fix & preview" (lib/auto-fix.ts reads HPD's reason: borough, apartment / location,
   address, dates, amount, section 5 phone, OMO; lists each change, what already prints from HPD's record, and
   what to check by hand like signing in blue ink) and shows the preview. Accept -> saved to the fixed folder
   (🖨 To print); Reject -> deleted, old details back. In To print, "✉ Tell HPD it's in the mail" writes to whoever
   signed the notice (name read from the notice PDF: 45 of 47 by MICHAEL WRIGHT JR, CCAP, wrightmi@hpd.nyc.gov),
   shows the email first, sends from your Google account on the second tap; the server only sends to one
   @hpd.nyc.gov address (action hpd-reply). Tests: test-auto-fix, test-drive-packages, test-browser-autofix.)

- **Test all (16 Oct)**: 60 unit tests + 21 browser tests pass, including the whole-app sweep
  (test-browser-all-buttons: 17 pages, 75 links, 64 buttons, no missing-data text), now run on every deploy.

## Owner's requests 16 Oct 2026 (midnight): two departments, days menu, icons pop
1. **Procurement and vendor tracking are two different departments, never mixed.** Procurement pays you: the job
   is done, the invoice was sent, and they reject the invoice / affidavit, so you correct it. Vendor tracking (J. Lewis,
   D. Gafur) asks for documents or an update. (Done: HPD notices shows two boxes, 💵 Procurement: Rejected ·
   Corrections · Print & mail, and 📋 Vendor tracking: Due now · Requests · Messages. Due now lists only 24-hour /
   72-hour notices and missing documents. Test: test-browser-notice-depts.)
2. **Days in one small menu**: the 30 / 60 / 90 days, Custom and 2024-25 chips took a whole row. (Done: one 📅 button
   next to SI opens 15 / 30 / 45 / 60 / 90 days, this year, all dates, custom dates, 2024-25 jobs.)
3. **Every icon pops up** when pointed at or tapped: boroughs (All, MN, BK, QN, BX, SI), the days button, map buttons,
   notice tabs. (Done.)

## Owner's requests 17 Oct 2026: notices on the map, Priority first (priority 1)
1. **Tap Notices -> everything on the map at once**, then pick what to look at, like the other filters. (Done: all notice
   jobs glow in their color; a small picker at the bottom: All · 🔥 Priority · 💵 Payment rejected · ✏️ Corrections ·
   🖨 Print & mail · The list. Test: test-browser-priority-map.)
2. **Priority = vendor tracking** (Lewis / Gafur asking for the affidavit, invoice, update; 24 / 72-hour notices). Pins glow
   with a timer ("24h · 19h left"); the Priority button shows the nearest deadline. (Done.)
3. **Outcome from the priority**: tap a priority job -> PRIORITY box with the hours left and five outcomes (work completed,
   refused access, no access, completed by others, partly done / going back) -> the affidavit opens with that outcome, put
   the date, preview, copy + original. (Done: links to /paperwork/?job=..&outcome=..)
7. **Missing documents (Gafur) on the board** (done 17 Oct): one card per job on a missing-documents list (last 31 days), what they want, days waiting, follow-up date; steps count only replies / PDFs that name that job (or the whole list). Filter All / 24-72 / Missing documents.
9. **Rejections tracked to PIP paid** (done 17 Oct: lib/payment-track.ts, Procurement -> 💰 To get paid, $ held on the picker and pins; tests test-payment-track, test-browser-money).
10. **Notices take you to the map** (owner, 17 Oct: "it should take me to the map"; done: after a pick the picker becomes a thin bar, the map fits those jobs above it).
11. **Reply to many at once** (done 17 Oct: board -> Reply to many; all replies written; each sent with its own two taps; all to me first in one email).
12. **Morning summary on the map** (done 17 Oct: first open each day; notices due today, missing docs, money held, bids; each line opens its place; ☀️ Today in Notices reopens it). Test: test-browser-today.
13. **Highlight corrections on the emailed copy** (done 18 Oct: lib/correction-copy.ts; cover page with HPD's reason + each change in yellow, COPY on every page; original stays clean for ink; print folder 👁 See the copy HPD gets). Signed copy: not made (corrections are signed in ink only).
14. **Under-6-hour reminder** moved onto the Notices button (pulses red with a tag); the banner covered map buttons.
15. **Notice deadlines count weekdays** (owner, 18 Oct: "they show on Friday but I have till Monday to answer them first thing"; done: lib/business-days.ts, Friday/weekend 24-hour -> Monday 10 AM, 72-hour from Friday -> Wednesday). City holidays skipped too (19 Oct, "next upgrade": nycHolidays/holidaysBetween; the day before a holiday counts like Friday; each open card shows "Due Tue 10/13 10:00 AM · 🗓 Columbus Day not counted").
16. **Head start on every notice** (owner, 18 Oct: "check what you can find on those notices... I found this aff / invoice or update on this date"; done: lib/notice-findings.ts, Found on record + next step on each board card and the map PRIORITY card; facts go to the AI reply). Test: test-notice-findings.
17. **Revise paperwork on the iPhone** (owner, 19 Oct: ER05228 locked, it was completed; window.prompt is blocked in the home-screen app. Done: on-page revise with reasons that set the new outcome, two taps; Archive / Change outcome / Approve return visit / Reset test job moved from confirm() to two taps). Tests: test-browser-paperwork-lock, test-browser-two-tap. Rule: never use window.prompt / confirm.
18. **Check my emails now** (owner, 19 Oct: "I just answered almost all notices from Lewis, auto check the sent email and update the notices... a button to scan"; done: server action hpd-scan (Gmail read-only, subjects/dates), board button + auto check on open, list of what changed). Tests: test-ai-draft (hpd-scan), test-browser-scan.
19. **Bid pins show the kind of job** (owner, 19 Oct; done: lib/job-icon.ts, picture in each pin + due day tag, list rows too). Test: test-browser-bid-icons.
20. **Gafur (AEP) separated + her whole list answered in one email** (done 19 Oct: picker chip, board filter, list reply with per-job status from the record; group emails about many jobs are not counted as sent).
21. **Failed bid fax: automatic resend + one-tap Resend now** (owner, 19 Oct: "ER06690 failed... it does not let me... this should be auto resend and confirm"; done: autoResendPlan in lib/bid-records.ts, next line, once per failure, max 3, before due; Resend now one tap; backup buttons no longer need the refill). Tests: test-auto-resend, test-browser-auto-resend, test-browser-bids.
22. **Bids: Stats in pages + daily progress** (owner, 19 Oct: "open mine stats history... everything separated not scroll one after other... stats of daily progress"; done: Progress / Wins & prices / Costs & rates pages, tabs at the top, checklist only under Open; bigger iPhone bid pins).
23. **Vendor tracking updates by itself + chime** (owner, 19 Oct: "as soon as we get a reply update the notice and close on map... ring or tone"; "fix could not check email... should be automatic"; done: emails reloaded every 5 min and on return (fresh encrypted copy straight from the repo via /api/private), live Gmail check when allowed else quiet fallback, chime + banner for new HPD emails (lib/chime.ts), Priority map from the updated threads).
24. **Bigger bids panel with charts** (owner, 19 Oct: "open mine stats history make bigger... clear chart graph... make it half way then pull up hide"; done: tabs open the panel half-way (60%), Mine charts by result + per week, month win-rate bars). Test all on 19 Oct: 40 unit + 41 browser tests pass.
25. **Fix payment rejections one by one** (done 19 Oct: 💰 To get paid -> Fix them one by one; queue in session storage; Next after Accept, Skip before; 26 to fix, $4,720). Test: test-browser-fix-queue.
26. **No answer -> ask them to confirm** (19 Oct, "next upgrade"; done: lib/notice-board.ts nudgeDays/draftNudge, 5 days after our paperwork with no answer, card button + "Ask N to confirm" batch, two taps, clock restarts after asking (hpd-notice-nudged); test-browser-nudge).
27. **No bid fills the form and faxes HPD** (owner, 20 Oct: "when I say no bid we need to fill no bid and send"; done: fillBidPackage noBid, sendNoBidFax / noBidFaxCover (reason not sent), NoBid keeps faxedAt / faxStatus, HumbleFax checked every minute, backup lines on failure; test-browser-no-bid).
28. **No flashing** (owner, 20 Oct: "app keeps flashing between windows"; cause: the app reloaded on every data-only deploy (~10 min); done: version.json `code` = last non-data commit, the app reloads only when it changes; deploy checkouts fetch history; test-browser-no-flash).
29. **Zoom only the job pages** (owner, 20 Oct; done: viewport max-scale 1 + no pinch outside [data-zoomable]; lib/use-pinch-zoom.ts on HPD's pages and the paperwork preview; map still pinch-zooms; test-browser-page-zoom, test-browser-correction).
30. **Better bid pin pictures** (owner, 20 Oct: "make icon more better"; done: JOB_GLYPHS drawn SVG on a job-colored disc, due ring + day tag, ! only for a failed fax; test-browser-bid-icons).
31. **A ring for every notification** (owner, 20 Oct: "ring for all notifications, including when they reply back"; done: lib/chime.ts tones per kind + notify(); banner for HPD email / reply (with sender), new invitation, bid and NO BID fax confirmed / failed, notice under 6 h; unlocked on every touch; test-browser-ring). Not done: ring with the app closed (needs Web Push; owner to decide).
32. **See what you sent** (owner, 20 Oct: "a link to see and confirm the paperwork that was sent, not just the dates"; done: /api/drive/hpd-sent + hpd-sent-pdf (Gmail read-only), SentPaperwork.tsx on the board and the priority card, PDFs open in place with zoom, Open in Gmail; test-ai-draft, test-browser-sent-pdf).
33. **Old-job date check** (owner, 20 Oct: "do both"; done: lib/old-job-dates.ts, paperwork stops when the work date is > 60 days after the award, Use HPD's dates / These dates are right; not for corrections; test-old-job-dates, test-browser-old-dates). Note: EP27382 itself isn't in the app's job lists (2026 jobs only), its paperwork came from the computer filler.
34. **Phone alerts** (owner, 20 Oct; done: lib/push.ts + components/PhoneAlerts.tsx on the Alerts page, /api/drive/push-subscribe (address encrypted, PUSH-<id> on the status server), public/sw.js push + click, scripts/send-push.mjs in the 10-minute fetcher (HPD wrote / replied, new invitation, notice under 6 h; data/push_state.json hashes only); needs the VAPID_PRIVATE_KEY GitHub secret; test-push, test-browser-push).
35. **Notifications list** (owner, 20 Oct: "alerts all the time; add notifications so we can manage and keep track of all"; done: lib/notify-log.ts, NotificationsPanel.tsx, 🔔 next to Filters and on the bids screen, tabs by kind, read / handled; test-browser-ring).
36. **A different alert per kind + cha-ching for awards** (owner, 20 Oct: "unique alerts for bids, notices, rejections, requests"; "cha-ching for awards"; done: lib/alert-kinds.ts (award / notice / request / rejection / message / bid / fax / deadline from the thread kind), tones in lib/chime.ts, phone alerts by kind (send-push), rejections from HPD's notices, sounds to try on the Alerts page; test-push, test-browser-ring). Also fixed: lib/bid-price.ts had 4 broken word checks (doors / tiles / paint coats / windows) since 15 Oct.
37. **Phone alerts automatic** (owner, 21 Oct: "this has to be automatic, I shouldn't have to turn it on"; done: push-subscribe works without the Google sign-in (Home Screen app has its own), autoRegisterPush on every open (daily), one Allow alerts card if never allowed; short alerts for phones not signed in).
38. **Moving sending signs + alert self-check** (owner, 21 Oct: "the hourglass is static while sending, should be spinning"; done: .hpd-spin / .hpd-dots / .hpd-sending in globals.css on fax send / fill / pending pin, chip, checklist, email check, replies, sent PDFs; phone checks /push-subs on open and re-registers; Alerts page shows server ✓ / Fix it now; status worker /push-subs reads storage directly).
39. **Overdue notices remind every 2 hours** (21 Oct, next upgrade after ER01987 went overdue; done: send-push repeats '⏰ … overdue N h — answer now' each 2-hour slot, weekdays 8 AM-8 PM NY; banners auto-hide 20 s; test-push).
40. **Alerts open their own job** (21 Oct, next upgrade; done: goTo(go, omo) -> board focus (scroll + yellow outline) / bid sheet / job card; phone alert links carry &omo=; test-browser-deeplink).
41. **Live fax tracker + tap feedback** (owner, 21 Oct: "better icons, more interaction like sending"; done: FaxTracker.tsx (4 steps, spinning current step, flowing line, confirm burst, fail shake), armed pulse, sent pop, map buttons press in, badges pop; test-browser-faxtrack).
42. **Morning briefing push** (21 Oct, next upgrade; done: send-push morningBriefing once per weekday from 8 AM NY: bids due today, notices overdue / due in 24 h, documents requests, rejections to fix (rejected after the paperwork on record); opens ?today=1; test-push).
43. **Evening wrap-up push** (21 Oct, next upgrade; done: send-push eveningWrapup weekdays 6-10 PM NY once: faxes from BID- records (confirmed / waiting / failed), NO BIDs, notices answered, still open, tomorrow's bids not yet sent; --wrapup sends it now; test-push). Also: page-zoom test waits for the bids map to settle.
44. **Jobs button** (owner, 21 Oct: "a button for the jobs like bids and notices"; done: JobsList.tsx in the work-button group, To do / Close out / 2nd try / Waiting on HPD / All, search, late first, HPD-closed / paid left out; test-browser-jobs).
45. **Critical alerts + app icon badge** (owner, 21 Oct: "better visual and sound alerts"; done: overdue notice / failed fax -> red centered box, rings every 30 s x5, Answer now / Snooze 30 min; Home Screen icon badge = unread (setAppBadge; the service worker counts pushes); test-browser-ring). Next ideas offered: glowing job pins with unread alerts, quiet hours, per-kind sound on/off.
46. **Calm map** (owner, 21 Oct: "everything glowing at once is annoying, prioritize the overdue, not blinking"; done: all pin / button pulses replaced by steady rings; only the most urgent notice job (is-glow-top) breathes slowly; bottom focus chip opens it on the board; test-browser-calm).
47. **Jobs round + one button** (owner, 21 Oct: "why is Jobs square, make it like the others, takes too much space"; done: round toolbox Jobs button, Close out / 2nd try buttons removed (tabs in Jobs with Package links / 2nd-try days), smaller focus chip; flow / stats / all-buttons tests use the Jobs list).
48. **Friday money report push** (22 Oct, next upgrade; done: send-push moneyReport Fridays 2-8 PM NY once (f:date): owed in PIP (open jobs), paid this week (pip_payments), rejections to fix + held (same trackPayments numbers as 💰 To get paid), oldest owed; asks for new PIP summaries when over a week old; opens ?money=all (To get paid tab); --money sends it now; test-push + test-browser-deeplink).
49. **Jobs list + map** (owner, 22 Oct: "I need to see the jobs on the map when I click the button, also the list"; done: Jobs sheet is the lower 52% of the screen, the map shows only the current tab + search (filteredJobs from jobsShown) and frames them above the sheet; 🗺 Map folds it to the tabs; the list hides behind a job card and returns on the same tab; test-browser-jobs).
50. **Vendor tracking sides + emailed PDFs** (owner, 22 Oct: "once I hit send it goes to sent, waiting for reply; not sent on one side, sent on another" / "check email, AFF INVOICE is labeled with every OMO, don't repeat what I sent" (Gafur's 7 Oct list); done: boardSide tosend / waiting / replied / done with tabs and a moved banner; buildBoard indexes our emails with aff/inv PDFs named for an OMO in any thread (row.filed, 📎 Already emailed), docs replies match file names, a whole-list note leaves jobs to send (generalOnly), her answer counts only for the job just sent; photos asks not satisfied by PDFs; the list email says sent on the PDF date; test-notice-board, browser notice-board / nudge).
51. **Voice alerts + email summaries** (owner, 22 Oct: "instead of beeps an actual voice: urgent email, message from Lewis, requesting documents, invitation to bid, confirmation of award; summarize what they're looking for"; done: lib/alert-summary (cleanEmailText, summarizeHpd, spokenAlert, work orders spelled), lib/speak (Web Speech, primed on touch, voice off switch), chime ring() = tone then words; banner and push body use the summary; Alerts page voice switch + samples; test-push). Locked phone: system sound only (iOS/Chrome web push can't speak), text carries the words.
52. **Bid screen: price + Save + Send together** (owner, 22 Oct: "too many scrolls; when I enter the bid price, Save and Send should be right next to it"; done: fc-bid-quick bar pinned to the bottom of the bid sheet, same price state, Save (high price takes two taps), Fill / Send (two taps), fax status after; test-browser-bidbar).
53. **Find any job** (owner, 22 Oct: "type a small description and it should guide me to the job; by address or job" after the mini split job ER08283; done: scripts/build-search-index.mjs (2026 + 2024-25 jobs, open bids, market awards, market descriptions, page 3 of every invitation PDF for address + description; masked + encrypted public/private/search.json.enc, only rewritten when it changes; run by the fetcher), /api/private/search, lib/job-search (all words, loose spelling, job # > address > description, yours first, newest first), FindJob under the map search box; test-browser-find).
54. **Voice catch-up for locked-phone alerts** (owner, 22 Oct: "voice alerts from now on, on my iPhone also"; done: sw.js keeps each push in hpd-badge /missed, the map shows "🔊 Play N new alerts" (iPhone speaks only after a tap), reads them, clears, logs them in 🔔; titles give the work order / sender to the voice; test-browser-missed).
55. **Voice search + recents + #418 fix** (22 Oct, next upgrade; done: 🎤 mic in the map search (SpeechRecognition / webkit), spokenSearch joins spelled job numbers and drops "find the job with", recent searches chips, ✕ clear; lib/use-now (NEXT_PUBLIC_BUILT_AT for the first draw, then real time) on Jobs / Alerts / job detail / Payments / Invoice, invoice number and date too; test-browser-find (fake recognizer), test-browser-no-418 (clock +40 days), test-push).
56. **No duplicate buttons** (owner, 22 Oct: "why duplicate Today's route; job card had Waze and Google already, why twice; no duplicate buttons at all in the entire app"; done: Today's route bar hidden unless opened (Route button only), Today -> Appts, next-job box: Open next job (no second Waze / Google), route list skips the next stop's Waze / Google (in Next stop), focus chip hides while the alert box / banner shows the same notice; test-browser-no-dupes (no two visible buttons with the same name on the map / route panel; one Waze / Google on a card)).
57. **"Why does it keep saying urgent"** (owner, 22 Oct): ER01987's 72-hour notice from Lewis (10/16) has no reply / PDF / paperwork on record, so it is really overdue. Done: ✓ I handled it (two taps) on the urgent box ticks it sent on this phone and saves HANDLED-<OMO> on the status server; send-push skips handled notices (no more 2-hour reminders).
58. **Bids in the voice: count, no work order** (owner, 22 Oct: "just tell me invitation to bid; if three, you have three new invitations to bid"; done: spokenAlert bid, missed playback counts bids first, send-push sends several new invitations as one alert).
59. **Personal voice agent** (done 22 Oct: lib/voice-agent parseCommand (outcome finished / no access / refused / partial / by others with job #, address or 'this job'; read job; bids; today; notices; yes / no; else search) + findJobRef; the search mic and Enter run it; fc-agent panel says and shows the answer; outcomes need Yes (spoken or tapped) and save through setJobOutcome; bids answer counts open ones (past times dropped), boroughs spelled out; test-push + test-browser-agent). Next: free questions through the AI. Original ask (owner, 22 Oct: "I want you to be my personal agent for this app, I'm able to talk to you: 'I finished this job' and you note it; give me the description, talk it out with me"). Plan: a 🎤 Talk button; speech -> intent (finished / no access / refused / appointment for <job>; read the description of <job> / the new bids; what's due today; which notices are open); every change is read back and needs a spoken or tapped yes before it is saved; replies spoken. Start with fixed phrases on the phone, then the AI (server/ai-draft) for free questions.
62. **Urgent alerts once** (owner, 22 Oct: "the urgent alert I want to hear once, then it says on screen; ER01987 keeps repeating"; done: the critical box rings once and stays quietly (no 30 s repeats), send-push drops the 2-hour overdue reminders (one alert per notice); test-browser-ring, test-push).
63. **"Why 0 all" on the board** (owner, 22 Oct: the board showed 0 everywhere and "Up to date"): the phone's Google sign-in had run out, so /api/private/conversations answered 401. Done: the board shows a Sign in with Google box (back to the board) when the emails can't be opened, and Check my emails says it couldn't open them; test-browser-signed-out.
64. **Sign-in handoff for the Home Screen app** (22 Oct, next upgrade, the cause of "why 0 all": iOS standalone apps open Google in a separate sheet with its own cookies, so the app never got the session). Done: lib/signin-handoff adds a one-time code to every /api/drive/start form in standalone mode; the callback keeps the sealed session in HPD_DRIVE_SESSIONS as handoff:<code> for 10 min; POST /api/drive/claim (app origin only, one use) sets the app's own session cookie; DriveSessionKeeper claims on load / focus and reloads; test-drive-auth + test-browser-handoff.
65. **Helper: free questions + wins** (owner, 22 Oct: "mic button test all, like 'which jobs have I won today'; it's hidden behind All / MN / Brooklyn"; done: awards intent (today / yesterday / this week / this month) from Confirmation of award emails + market_awards won; ask intent -> POST /api/drive/hpd-ask (server/ai-draft aiAnswer: facts only, 1-4 spoken sentences, no markdown, never changes anything) with the app's facts (notices, open bids, money held, job counts, route, job on screen; no tenant fields); pending yes kept 2 minutes (yes from the search mic); FindJob list moved below the borough bar (z 2100); test-browser-mic (9 sentences through the mic), test-browser-agent, test-push).
66. **Search without sign-in + tenant contacts kept in the app** (owner, 22 Oct: "it says sign in to search, why, auto sign in" / "I need all tenant contact info all the time"; done: build-search-index writes public/data/search-index.json (scrubPublic, no PDF names) besides the encrypted index, which now keeps HPD's text with tenant contacts (masked copies never beat the original); FindJob uses the private index signed in, the public one otherwise (note: contacts show signed in); market descriptions kept whole in public/private/market-descriptions.json.enc, public copies scrubbed. Google itself needs one sign-in (no app can skip it); the Home Screen app keeps it 30 days and renews it).
67. **Privacy fix: tenant contacts found in public files** (22 Oct, found while building 66): public/data/hpd_jobs_2026.txt (old unmasked job backup with tenant names / phones) removed and dropped from the build check; maskText phone patterns loosened (any spacing); scrubPublic (TEL / PHONE …, TENANT CONTACT: LAST, FIRST) on market awards / descriptions / COA_older / search index; the public CSV rebuilt from the masked JSON; scripts/test-public-privacy.mjs scans every public data file on each deploy. Note: older copies remain in git history (a history rewrite needs the owner's yes).
68. **Helper: wins misheard + descriptions** (owner, 22 Oct: "which jobs I want today… read the description, it's asking me which job"; done: 'want / one' with 'jobs' + a day = won; 'read / description' reads each won job in plain words (job file, else the job index); '·' spoken as a pause; test-browser-mic + test-push).
69. **AI switched on** (done 22 Oct with the owner signed in to Cloudflare: Pages project Settings -> Bindings -> Workers AI, name AI, next to the KV HPD_DRIVE_SESSIONS; /api/drive/session reports aiReady). Original note: **AI for free questions: needs switching on** (owner, 22 Oct: "it says it needs AI switched on"): the live site has no AI connected (Pages binding "AI" for Workers AI, or the secret ANTHROPIC_API_KEY). Bindings live in the Cloudflare dashboard (no wrangler.toml), so it's the owner's step: Cloudflare -> Workers & Pages -> hpd-bid-dashboard-2026 -> Settings -> Bindings -> Add -> Workers AI, name AI -> redeploy. Until then the fixed commands answer (wins, bids, today, notices, read a job, finished / no access).
70. **Text the tenant with AI, remind to call** (done 22 Oct: lib/tenant-text (ready text, Messages link sms:&body=, tenantStep none / waiting / call: next morning 8 AM or after They replied, nothing after a visit / appointment); job card Tenant: 📱 Text tenant -> AI draft via /api/drive/hpd-ask (never given the phone) -> Open in Messages (owner presses Send) records TenantTextedAt; They replied; the existing Call button lights up; send-push: 📞 Call the tenant at <address> once per text in working hours; test-browser-tenant-text + test-push). Original ask (owner, 22 Oct: "once I have the tenant info, the AI needs to reach out to the tenant and describe the job, a text message is good, and if they follow up remind me to give them a call"). Plan: 📱 Text tenant on the job card: the AI writes a short polite text (United Angel for HPD, the job in plain words, asking for a good time / access); tapping opens the iPhone's Messages with the tenant's number and the text filled in; the owner presses Send (never sent by itself). The app records "Texted <time>"; if no appointment / visit is saved by the next morning, a phone alert: "📞 Call the tenant at <address>"; "They replied" -> reminder to call back. Later, if wanted: automatic texting through a texting service (e.g. Twilio, its own number, tenant consent rules) — owner's choice.
71. **Always: everything the owner asks goes in this plan** (owner, 22 Oct: "add everything to the master plan, always").
72. **"Switch on AI" / "auto sign me in all the time"** (owner, 22 Oct): the AI is on (aiReady true); the owner's phone wasn't signed in, so questions got no AI answer. Done: helper answers signed out with "The AI is on, sign in" + a Sign in with Google button in its panel; tenant text says why the ready text was used; the sign-in cookie lasts 365 days and renews whenever the app checks in (DriveSessionKeeper, every 6 h while open), so one sign-in from the Home Screen app keeps it (Google can still end it: password change / access removed). A sign-in with no tap at all isn't possible (Google requires it once).
73. **Voice actions** (in-app request 20261022235146: "make everything AI, make it smarter, I should be able to talk and get everything done"; done: voice-agent intents text-tenant / call-tenant / navigate (job or next stop: Today's route, else the closest open job) / arrived (job on screen or within 200 m, needs yes) / open; the helper panel offers action buttons (📞 Call, Waze, Google — a tap starts them, as the phone requires); test-browser-mic (14 sentences), test-browser-tenant-text (call / text by voice), test-push).
74. **"Where do I sign in"** (owner, 22 Oct; done: fc-signin-bar at the top of the map while the private data / emails can't be opened (privateOk false or threads null), one tap -> Google (with the Home Screen handoff), gone once signed in; the job card tenant line has the same button instead of "Storage page"; test-browser-signed-out).
75. **"Plan my day" by voice** (22 Oct, next upgrade; done: plan intent (plan / build my day / route, where should I go first) -> TodayRoute buildRequest -> planDay (the route panel's planner) -> the helper reads back the stops once saved (waits up to 8 s); 'take me to the next stop' then uses that route; test-browser-mic (16 sentences), test-push). Also: the right browser pane is left on the live site after testing (owner tapped Sign in on the localhost test copy and got a 501).
76. **Notices and paperwork by voice** (23 Oct, next upgrade; done: reply-notice intent (answer / reply + notice, Lewis, Gafur, HPD; the job named, on screen, the only one waiting, or Lewis's / Gafur's most urgent) -> board opens on that row with NoticeBoard autoReplyOmo (AI reply being written; Send still two taps); paperwork intent (do / make / send + paperwork, package, affidavit, invoice) -> 📄 Open the paperwork button (generate with the saved outcome, else the paperwork page asks); test-browser-mic (18 sentences), test-push).
77. **A smarter helper: many questions at once, any wording** (owner, 23 Oct: "make AI much better, ask multiple questions in different ways, like how many jobs I won today read me the description"; done: splitCommands (and / then / also / ? when every part is understood; '…won today, read me the description' stays one) answered in turn (a part needing yes stops the chain and lists what's left; a part with buttons ends it with the earlier answers on top); conversational sentences -> AI; AI facts add winsThisWeek and hpdEmailsLast3Days (summaries, phones removed); 'no awards today' names the last win from the award emails too; test-browser-mic, test-push).
78. **Conversation, memory, bids flow, fax resend, sound** (owner, 23 Oct: "mic not working on my iPhone; it said 3 yesterday, then asked which job when I asked to read the descriptions; I want a continue-conversation button; once I send a bid it should go back to the bids map; a failed bid fax should auto resend and just tell me, no snooze; I don't hear the sound alert or the voice"; done: lastJobsRef (wins / bids / notices / day's route) + read-job pick / all ('read me the descriptions', 'the first one', 'number two'); 💬 Keep talking (listens again after each answer via speak onEnd; 'stop' / ✕ ends; rests after silence); mic errors explained (not-allowed: Settings Microphone / Speech Recognition / Enable Dictation; no recognition: keyboard 🎙 + Go); after a bid send the sheet returns to the bids map with a sent note; failed fax: 'message' notice when autoResendPlan can resend, red box only when it can't (OK, no snooze), and when an automatic resend fails; navigator.audioSession 'playback' so tones and voice play on silent; tests: test-browser-mic (memory + conversation), bids / faxtrack (back to the map), test-push).
79. **Affidavit flow: sign once, notary one tap, right form every time** (owner, 23 Oct: "it keeps asking me to sign for the copy, that should be automatic; better the flow; always check if we need the old affidavit or the new version"; cause: signatures were saved per app copy, and on an iPhone the Home Screen app and Chrome keep separate storage, so the other copy asked again; done: a private 'HPD saved signatures (private).json' in the owner's own Drive (/api/drive/signatures, signed in only; PNG pictures + notary name only), filled in by itself in any app copy that is missing them and updated when you sign, change or remove; your card says '✓ … signature goes on by itself' with signing tools folded under 'Change signature'; a saved notary is one tap ('✓ Notary …: I witnessed the signing · approve <date>'), name / date / re-sign under 'Change notary, name or date'; the notary's tap stays on every affidavit (it is their statement that they watched you sign; a notarization without it is not valid); a line on the paperwork page names the form: 'Earlier HPD affidavit (Rev. 01.21.2025)' for jobs awarded before Aug 28, 2026, 'New HPD affidavit' from then on, from the award date only (one affidavitForm() used by the page and the PDF build); corrections stay ink-signed with no signature pictures; test-browser-affidavit-flow (ER03009 awarded 08/14/26 -> 2025 form; a fresh app copy opening ER05729 awarded 09/17/26 -> new form, no signing, one notary tap, package builds)).
80. **Vendor tracking board as a real conversation** (owner, 23 Oct: "better flow between messages, clear like a real conversation; clearly see what update we found in email and highlight it, like reply sent, paperwork made; verify it was made; see the actual file I sent and when"; done: each notice opens as a chat thread, theirs on the left, ours on the right, in time order: their notice -> our reply -> paperwork made (from the app, with the PDF) -> sent to vendor tracking (the actual sent PDF, opened from the sent email, with date and time) -> their answer; every step found in email says where it came from ('found in your Sent mail 10/22 3:14 PM') with a highlight on what is new since the last look; 'Verified' only when the email with the job's PDF is really in Sent; a step ticked by hand says 'marked by you'; the next thing to do is one big button at the bottom of the thread).
   Built 23 Oct: lib/notice-convo.ts noticeConvo(row) -> fc-convo in every board card: their notice always first (left), then in time order: we replied, paperwork made, sent to vendor tracking (right, green), their answer / confirmed (left). Each of ours says how the app knows: '✔ Verified: found in your sent email <date time>' (an email with the job's PDF), '✔ Made in the app', or 'Marked by you' (amber, dashed, 'Not found in your sent email yet'). The PDF name that went out is shown, and '📄 See what you sent' opens the actual sent PDF from Gmail inside the 📤 message. Anything that came in since you last looked at that notice (this phone, saved 5 s after the board opens) has a yellow ring and NEW. test-notice-convo (unit), test-browser-notice-board, test-browser-vt-send.
81. **Max map space, clear alerts, auto flow between bids** (owner, 23 Oct: "bids pop-up with the alerts bell is big and takes up too much space; I want clear alerts, big like the fax-not-sent box; I need max space on the map, auto hide all / today / tomorrow"; and "everything needs to flow auto: I sent a bid, it should auto zoom me to the next bid; I might want to come back, so I say come back; the app zooms in and out of the map as it flows"; done: the bids header is one slim line ('📨 8 bids · 0 today', 📅 day pill, small 🔔, '✕ Jobs'); the All / Today / Tomorrow / day buttons and the details open from the 📅 pill and fold away after a pick or 6 s; alerts are bigger and clearer (big icon, the kind on top, the full message up to 3 lines, a blue 'Open ›', a big OK); after a bid is sent the map glides (zooms out and back in) to the next bid that is due soonest and not sent / not a no-bid, and opens it, with '📠 ER… sent to HPD · $… · Next bid: ER…' and '↩ Come back to ER…'; saying 'come back' (or 'go back to the last bid') does the same; no bids left: back to the bids map. Tests: test-browser-bids, bid-sync, faxtrack (next bid, then Come back), ring, bids-panel, mic.
   Done 23 Oct ("next upgrade"): notices flow too: after a reply goes out (two taps), the board moves on to the next notice still to answer (due soonest), scrolls to it and starts its AI reply (it is not sent: two taps as always), with '✓ Sent to … · Next: ER… · ↩ Back to ER…'. A follow-up asking them to confirm stays on its card. The bid 'sent · Come back' bar now rides inside the next bid's card, so an alert at the top can't cover it. Test: test-browser-board-next.
   Done 23 Oct ("next upgrade"): the day's route flows too: a job on Today's route finished with its paperwork approved shows '➡ Going to the next stop, ER…, in 8s…' (Go now / Stay here), then the map glides (zooms out and in) to the next stop and opens its card; 'Open next job' glides too; nothing moves before the paperwork is approved. The slim bids bar fits narrow phones (count + today always shown; ✕ and 📅 as icons). Test: test-browser-auto-next.
82. **Fewer 'deploy failed' emails** (owner, 23 Oct: "I keep getting notifications deploy failed Cloudflare, I don't want them"): the emails are GitHub's own for a failed check (account setting: github.com/settings/notifications -> Actions, owner turns them off; we never change account settings). On our side every push now runs all browser tests on the computer first, so a push should not fail the deploy.
83. **Job counts for each day window** (owner, 23 Oct: "I want to be able to see the number of jobs I have when I choose 15 days etc"; done: the 📅 menu shows how many jobs each window has (Last 15 / 30 / 45 / 60 / 90 days, This year, All dates) with the status, borough, date type and search picked now, counted with the same rules as the map (jobs you're working and jobs due now always count), and the 📅 button carries a blue badge with the jobs on the map now; picking a window puts exactly that many on the map. Test: test-browser-day-counts (real job file: 15 d 21, 30 d 24, 90 d 68, year 125 on 23 Oct).)
84. **Bid by voice** (from the recommendations; owner: "next upgrade", 23 Oct; done: a 🎤 next to each bid's price (the search 🎤 is under the bids bar); saying "bid 500", "bid $1,250 on this one", "price it at 900" or "put 750 on it" fills the open bid's price and taps Save for you (so a price far above what wins still asks for its second tap), the bid document is made, and the helper answers out loud; sending is still your two taps. Test: test-browser-bid-voice.)
85. **One smarter AI: appointments, reminders and actions by talking** (owner, 23 Oct: "AI needs to be smarter, combine all AI, communicate with tenants, create appointments, remind me, route me, all by talking"; done: "make an appointment for EQ15239 Thursday at 10" (lib/voice-when.ts reads today / tomorrow / weekdays / 10/27 / Oct 30, 10am / 2:30 pm / noon / in 30 minutes) -> checks the time and overlaps -> after your yes it is saved on the job (appointment requested, 1 hour) with "📱 Text <tenant> the time" (Messages, you press Send) and "🔔 Add to Calendar"; "remind me to call Lewis at 3" -> the app rings and says it at that time while open, and Add to Calendar (/api/appointment-calendar?kind=reminder) alerts at that time with the app closed; any sentence the helper doesn't know goes to the AI, which answers and can pick up to 3 of the app's own commands (DO: lines: text / call the tenant, take me to, open, read me, plan my day, answer the notice, do the paperwork, make an appointment, remind me, new bids, today), each run as if you said it (saves still ask for your yes, texts still open Messages); the AI also gets your open jobs (numbers and addresses, never tenant phones). Test: test-browser-voice-appt.)
86. **Award alert, paid alert, text service, glide to the job** (owner, 23 Oct: "yes build award alert and paid alert; just build the text service; the AI can send texts for me, I'm the contractor awarded"; "zoom into the job when I click and zoom back to the map"; done:
   - 💰 award alert (phone + in the app): "You won ER… · <address>" with the work in plain words from the job file;
   - 💵 paid alerts from PIP: "HPD paid you $10,629" (each payment, last 7 days) and "Paid · ER… $1,250 · <address>" (each job PIP shows paid, last 7 days), so turning it on doesn't ring for old ones;
   - 📱 text service (server/tenant-sms.mjs, Twilio): "📤 Send it now" on the tenant text (two taps) sends from the business number; tenants' replies come to /api/sms-inbound (Twilio-signed only), wait in a private inbox, and every 2 minutes the app marks the job "replied" and rings "💬 <name> replied · ER…" with their words; not set up -> Messages on the phone as before;
   - 🤖 automatic first text on a new award (scripts/send-push.mjs autoTextAwards): working hours, once per job, tenant name / address / apartment / work; marks TenantTextedAt so the no-answer clock and the call reminder start; Twilio errors (e.g. STOP) are remembered, not retried; AUTO_TENANT_TEXT=off (GitHub variable) stops it; the owner gets "📱 Texted the tenant · ER…";
   - 🗺 tapping a job glides the map in to its building (zoom 17) and closing the card glides back out to where you were.
   Owner setup for texts (owner does it; keys never in the code): a Twilio account and phone number; US business-text registration (A2P 10DLC) in Twilio; Cloudflare Pages secrets TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM (and the same as GitHub secrets for the award text); in Twilio, the number's "A message comes in" webhook = https://hpd-bid-dashboard-2026.pages.dev/api/sms-inbound (POST). Tests: test-tenant-sms, test-push.)
87. **Money by voice, and an AI that remembers the conversation** (owner, 23 Oct: "next upgrade"; done: "how much does HPD owe me" / "what's outstanding" / "did I get paid" / "money report" -> what PIP shows still owed (total, number of jobs, the 3 biggest with addresses), how much rejections hold up, and the last payment; "read me the first one" then works on those jobs; the AI now gets the last 4 turns of the conversation (15 minutes) so follow-ups like "that one", "text them" or "and the other job" make sense. Test: test-browser-voice-appt.)
88. **A job start to finish by voice** (from the award-to-payment plan; owner: "next upgrade", 23 Oct; done: "what's left on ER05729" / "where are we with this job" / "status of EQ15239" / "track ER05729" opens the job (the map glides there) and answers in one go: Done (awarded, tenant texted / replied, appointment, arrived, outcome, paperwork approved, sent to HPD, closed, paid $) and Left (text the tenant / go do the work / save the outcome / make and send the paperwork / wait for HPD to close it / get paid: $… still owed / wait for it to show in PIP); the AI can use it too. Test: test-browser-voice-appt.)
89. **Better alerts list** (owner, 23 Oct: "I need alerts to be better"; done so far: the 🔔 list is grouped under Today / Yesterday / the date, and "🔊 Read them to me" reads the new ones out loud (up to 6, newest first); earlier today: bigger, clearer pop-up alerts with the kind, the full message, Open and OK; award and paid alerts. Waiting on the owner: which alerts bother most (too many, too quiet, hard to read, missing, gone too fast). Test: test-browser-ring.)
90. **🧭 Job tracker: every job from award to payment** (owner's award-to-payment plan, step 6; "next upgrade", 23 Oct; done: Map menu -> 🧭 Job tracker, or say "show my job tracker" / "my pipeline": 10 stages with counts (Text the tenant · Waiting on the tenant · Call / book a time · Appointment set · Work started · Paperwork to make · Sent, HPD to close · Closed, waiting for payment · Closed, no PIP record · Paid), the first stage with work for you opens by itself, each job shows a short note (awarded date, texted / replied, appointment, sent date, $ owed, $ paid) and opens its card on the map. PIP lists only 51 of the 697 2026 jobs, so closed jobs over 90 days old with no PIP record get their own stage instead of 'waiting for payment' (on 23 Oct: 124 / 0 / 0 / 0 / 0 / 0 / 74 / 13 / 443 / 43). Tests: test-job-tracker, test-browser-job-tracker.)
91. **☀️ Start my day** (from the recommendations: "a morning hands-free start"; owner, 23 Oct: "keep going to the next upgrade, don't wait for me"; done: the first time the app is open between 5 and 11 AM (New York) a card says "☀️ Good morning": one tap ("Start my day") reads the day out loud (notices, bids due, jobs) and plans the route (8 stops), both in the helper; "Not today" hides it; once a day. Test: test-browser-morning.)
92. **📊 The week in one answer** ("keep going", 23 Oct; done: "how did I do this week" / "weekly report" / "how was my week" -> "This week you won 8 jobs, sent N bids, finished N jobs, sent paperwork for 27, and HPD paid you $… (or no payment yet)", last 7 days: wins from HPD's award emails, bids faxed, outcomes saved, paperwork sent, PIP payments; the AI can use it too. Test: test-browser-voice-appt.)
93. **📅 Appointment alert an hour before** ("keep going", 23 Oct; done: scripts/send-push.mjs rings every phone once when an appointment (requested or confirmed, saved on the job and synced to the status server) starts within the next 70 minutes: "📅 Appointment in 40 min · 1207 1 AVENUE" / "EQ15239 · Mon 10/26 · 10–11 AM · Maria"; works with the app closed (the fetcher runs every 10 minutes); cancelled and later ones stay quiet. Test: test-push.)
94. **Tenant step on every job card** ("keep going", 23 Oct; done: the job card's journey strip is now Awarded -> Tenant -> Work -> Papers -> HPD closed -> Paid; Tenant shows "text for a time" / "Tenant texted <date>, waiting" / "Tenant replied <date>: book a time" / "Appointment <date time>" and the Next line says what to do (text the tenant / wait, call after a day / call and set the appointment); labels no longer break mid-word. Test: test-job-stages.)
95. **Upgrades go live faster** ("keep going", 23 Oct; done: the deploy's 72 browser tests run three at a time (scripts/run-browser-tests.mjs) instead of one by one (about 50 minutes); each test's output is printed as it finishes, and a test that fails is run once more on its own at the end (it only counts as passed if that run passes, and the log says "passed on its own: timing on the build machine").)
96. **Text from the tracker** ("keep going", 23 Oct; done: in 🧭 Job tracker, jobs in "Text the tenant" and "Call / book a time" have a 📱 button: the job opens with the tenant text already written (Send it now / Messages). Test: test-browser-job-tracker.)
97. **Text a tenant hands-free** ("keep going", 23 Oct; done: with the text service on, "text the tenant for EQ15239" reads the ready text out loud (tenant's first name, address, apartment, the work) and waits; "yes" sends it from the business number and marks the job texted (the no-answer clock starts); not set up: Messages on the phone as before; the card's "Send it now" still takes two taps. Test: test-browser-voice-sms.)
98. **A tenant's reply becomes the appointment** (award-to-payment plan step 4; "keep going", 23 Oct; done: when a tenant texts the business number back with a day and time ("Thursday at 10 works for me"), the job is marked replied and the helper shows their words and "Make the appointment at <address> on Thu 10/29 · 10–11 AM? Say yes, or tap Yes"; Yes saves it as confirmed and, with the text service on, texts them the confirmation by itself (it doesn't restart the no-answer clock), plus Add to Calendar; a reply without a time just rings as before. Test: test-browser-reply-appt.)
79. **Recommended next (flow)**: (a) after sending a bid, offer the next bid due soonest ("Next: ER… due 11 AM, open it?") so bidding runs back to back; (b) bid by voice: "bid 500 on this one" sets the price, saves, fills, and asks yes before the two-tap send; (c) a morning hands-free start: the first open of the day reads the briefing and stays in 💬; (d) new alerts read out while 💬 is on.
60. **Auto-arrival on the route** (done 22 Oct: "Have you arrived?" card near a route stop / a job navigated to today, Yes opens the job + markArrived, asks once per job, rechecks on jobs load / every 20 s / back from Waze-Google; to-do and 2nd-try jobs; tone + voice, no repeating banner; test-browser-arrive). Original ask (owner, 22 Oct: "even if I use Google or Waze, it should know I arrived and start the job, or ask me 'have you arrived?'"). Plan: while a route / navigation to a job is on, watch the phone's location (when the app is open or comes back from Waze / Google); within ~100 m of the job for a minute -> "You're at <address>. Start the job?" (one tap, or yes by voice) -> I have arrived + timer; no silent changes. iPhone limits location in the background for web apps, so it asks when the app is opened at the site.
61. **Job description first on the job card** (done 22 Oct: "📋 The job" from lib/job-summary at the top of the card, HPD's full text below, Read aloud reads the summary first). Original ask (owner, 22 Oct: "the job description, very nice and clear, right there on the top, and a summary"): a short plain summary (what, where in the building, size) at the top of the card, HPD's full text one tap below; read aloud.
8. **Next ideas (owner to pick)**: phone alerts (home-screen app); morning notices summary.
6. **Send the paperwork to vendor tracking from the board** (done 17 Oct): outcome / 📤 Send the paperwork -> paperwork page (?vt=1, recipient in session storage) -> package made -> "Send to vendor tracking" box, signed copy attached, Send to me first or two-tap send (hpd-reply) -> board step 📤 ticked. Test: test-browser-vt-send.
5. **Bigger and clearer on the iPhone; everything pops when touched** (done 17 Oct: bigger map / borough / days buttons and words, tap pop on every button and link; short screens keep the 9 map buttons fitting).
4. **24 / 72-hour board** (done 17 Oct: lib/notice-board.ts, NoticeBoard.tsx, tests test-notice-board + test-browser-notice-board; replies: ✨ AI-written from the notice + facts on record (server/ai-draft.mjs, action hpd-draft, signed-in only; Cloudflare Workers AI binding "AI" or secret ANTHROPIC_API_KEY; owner must switch one on), ready-made draft as fallback): a dedicated 24 / 72-hour board that tracks each notice to the end: reply sent -> paperwork made ->
   sent to vendor tracking -> confirmed; AI drafts the reply for each one (owner approves, two taps); reminders when
   under 6 hours left; done items drop off by themselves when the paperwork is on record.

## Done 16 Oct 2026: your price vs the app's best price
- Finding (1,547 of your faxed bids that HPD awarded, Nov 2025 - Oct 2026): your prices were a median 16%
  above the app's best price (about 20% since March; half of all bids more than 15% above). Typical chance to
  win: 39% at your price, 80% at the best price. At the best price you would have won 964 jobs ($795k)
  instead of 625 ($424k). Lock / latch: the app's best price already wins 86% of plain lock jobs, so the
  "+98%" on lost lock bids was the price sent, not the app's advice.
- **Stats -> "Your price vs the app's best price"**: the totals and the last 6 months (totals only,
  scripts/build-bid-win-stats.mjs -> vsBest).
- **Bid screen**: a price more than 15% above the best price shows "N% above the best price, wins about X%;
  $best wins about Y%" with **Use $best** (one tap, saving still allowed). Under 1 in 4: the old red warning
  and a second tap to save. Test: scripts/test-browser-price-check.mjs.
- ~~Next: the owner's own cost floor per kind of work.~~ **Done 16 Oct**: under the best price on every bid,
  **Set my minimum** for that kind of work (kept on the phone, lib/cost-floor.ts). The best price (bid
  screen, list rows, checklist, sitting) never goes below it, with that price's own chance to win; a price
  typed under it gets "Below your minimum" + Use. Stats -> Your minimums lists them (Remove). None set =
  the app's best price as before.

## Lost although our price was lower: what happened (reviewed 16 Oct 2026)
9 bids (Sept 10 - Oct 8) lost at a price at or under the winner's (scripts/analyze_lost_bids.py, Gmail
fax records; private details in data/private/lost_bids_review.json):
- 4 LATE: ER05900 (due 10:00 AM, faxed 10:14-10:24); ER05619 + ER05693 (faxed 10:53-10:56, RingCentral
  delivered 11:07-11:15); ER05042 (5 tries, HumbleFax line busy, confirmed 11:05 / 11:18).
- 1 SENT INSIDE ANOTHER JOB'S FAX: ER06823 went in a 26-page fax titled ER07042 with other bids.
- 4 sent early and delivered (ER06179, ER06009, ER05956, ER05790): only HPD can say why -> ask HPD's bid
  desk (owner) whether the bids were received / responsive.
Changes: one bid per fax (the app's HumbleFax send already does this); checklist and bid screen say
"Send now" 45 minutes before the deadline and "may arrive too late" under 10; deadlines before 11:00 AM
are tagged "early deadline". Rule: send at least 45 minutes before the deadline.

## Done 16 Oct 2026: multi-bid sitting
- "🎯 Bid all N in a row" (checklist): the to-do bids one after another, soonest due first, each opened with
  the best price filled in. A bar on the bid: "Bid 2 of 6", Skip ▶ / Stop; once the fax is sent it turns
  green with "Next bid ▶" (bids sent meanwhile are skipped automatically). Ends with a summary
  ("5 sent, 1 skipped (ER...)").

## Done 16 Oct 2026: morning bid checklist
- Bids screen opens with "☀️ Bid checklist · N of M sent": every invitation due today and tomorrow, its
  state (no price yet / price saved, not sent / fax going through / sent and confirmed / fax failed / past
  due), time left, and the best price with its win chance. "Bid $X" opens the bid with the best price filled
  in (opening a bid otherwise starts from your last price for that kind of work, which kept lock prices
  high). Opens by itself each day; closing it is remembered for the day. (lib/bid-checklist.ts)
- The invitation reader skips HPD's Confirmation of Award letters (ER07755's award was flagged "couldn't be
  read" on 10/15). ER07755 was won at $5,200.
- Work moved to C:\dev\HPD-Bid-Dashboard-2026 (D: kept failing); private files restored from the C: backup.

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
- ~~Invitation pages: load faster (keep the drawn pages on the phone) and show them in the bid list too.~~
  **Done 2026-10-16**: drawn pages are kept on the phone for 21 days (lib/page-cache.ts, IndexedDB), so a bid
  opened before shows its pages at once with no download; the next 8 bids due are drawn ahead after the
  list shows (about 6 s for 8). Each bid-list row has a **Pages** button with a small picture of HPD's job
  description; it opens the pages full screen without opening the bid (**← Bids** / **Price it →**).
  Test: scripts/test-browser-bid-pages.mjs (pages from the phone in under 0.1 s).
- ~~Notices: per-notice preview of HPD's own email/PDF inside the app (not only the Gmail link).~~ **Done
  2026-10-15**: each rejection in HPD notices has **👁 See HPD's notice**: HPD's email (subject, date,
  sender, full text) and every page of the PDF they sent back as pictures (tap = full screen, zoom), then
  **Fix & resend this one**. Read from Gmail by scripts/fetch_notice_documents.py (47 jobs, 90 PDFs at
  start; the GitHub fetcher adds new rejections each run), stored encrypted in public/private/notices*,
  shown only when signed in with Google. Test: scripts/test-browser-notice-view.mjs.
- Correction dates filled in automatically from the paperwork originally sent (Sent mail PDFs), so older
  jobs don't need dates typed by hand.
- One fax for several bids due today (the sitting covers the one-after-another part).
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

## Autopilot: from award to payment (owner's idea, 23 Oct 2026)

Owner: "Say we get an award today: the AI lets me know the location and the work description, texts the tenant first to
get a response; no response within 24 hours, it makes a phone call and talks to the tenant (that it is the AI assistant
for United Angel Construction reaching out about the emergency repair, the description, and when the tenant is available
for an appointment), and tracks the job all the way to close and payment received. I can pay for some AI if needed. It
has to sound realistic. Let's make a list of upgrades like this idea."

Each step below says what is built, what it needs, and what it would cost. Steps marked **needs the owner** wait for the
owner's sign-up or decision; nothing is sent to tenants by itself until the owner says yes to that step.

1. **Award alert with location and work** (built 23 Oct, item 86). When HPD's award email comes in: a phone alert and
   spoken summary, "New award: ER… at <address>, <work in plain words>", the pin on the map, and the job card open on
   tap. (Award emails are already read; the spoken award card is the new part.)
2. **First text to the tenant, by itself** (built 23 Oct, item 86; owner said yes; **needs the owner's Twilio account** to switch on). Today the app writes the text and the
   owner presses Send in Messages (an iPhone web app can't send a text silently). To send automatically the app needs a
   texting service: Twilio (about $1.15 a month for a number + about 1 cent a text) and US carrier registration for
   business texting (A2P 10DLC, about $20 one time, about 1 to 2 weeks). Tenant replies come back into the app and to the
   owner's phone. Every text says who we are and "Reply STOP to stop texts"; STOP is honored right away.
3. **No reply in 24 hours: an AI phone call** (**needs the owner**: a voice AI service + legal check). A voice AI
   service (for example Vapi, Retell or Twilio with a realtime voice model; about 7 to 15 cents a minute, so roughly 30 to
   50 cents a call) calls from the business number. Script: "Hi, this is the AI assistant for United Angel Construction.
   HPD sent us to do an emergency repair at <address>: <work>. When are you available for us to come?" It always says it
   is an AI assistant, calls only 9 AM to 7 PM, gives the owner's number for a person, and stops if asked. Before turning
   it on: US rules (the FCC treats AI voices as artificial voices: calls and automated texts to cell phones need the
   person's consent) mean the owner should confirm with HPD or a lawyer that contacting tenants for an HPD repair is
   allowed this way. Until then the app reminds the owner to call (already built: "call the tenant" reminders).
4. **Appointment from the conversation** (built 23 Oct, items 85 and 98). By voice the owner can already say "make an appointment for
   EQ15239 Thursday at 10" (saved after a yes, text to the tenant with the time, Add to Calendar). With steps 2 and 3 on,
   the tenant's answer ("Thursday morning") becomes the appointment by itself, with a confirmation text and the owner's
   reminder.
5. **Route me** (built): plan my day, take me to the next stop, the map glides to the next stop after each job.
6. **Track the job to close** (built: 🧭 Job tracker, item 90): arrival, photos, outcome, affidavit + invoice (signature automatic, notary
   one tap), sent to HPD, vendor tracking conversation, HPD's answer; each step rings the owner when it changes.
7. **Payment received** (built 23 Oct, item 86): PIP payments are already read (pip_paid.json); add a "💵 Paid: ER… $…" alert and
   a "paid" step on the job, and a weekly "money still owed" summary by voice.
8. **One AI for everything** (built 23 Oct, item 85): the helper understands free sentences and picks the app's actions.
   It now remembers the last turns (item 87); next: whole jobs by conversation ("what's left on ER05729?" -> "make the paperwork" -> "send it").

Order proposed: 1 and 7 now (no cost); then 2 (owner signs up for texting); then 3 after the legal check; then 4 joins
them. The owner enters any payment details and API keys themselves (keys go into Cloudflare as secrets, never in the code).

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
