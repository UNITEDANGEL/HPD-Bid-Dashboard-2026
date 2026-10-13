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
- Never miss one: the count must match the inbox (13 Oct: 14 invitations arrived; keep re-checking).

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

## Now (in this order)

0. **Multi-door prices** are still the weakest (typical miss 22%): read "per door" / "each" amounts and
   jobs that mix a new door with hardware on other doors.
1. **"My cost" floor** per kind of work.
2. **Win rate from sent bids** (your price vs the winner's on jobs you actually bid).

3. **2025 jobs**: recover statuses for last year's jobs too, if needed.

## Open items for the owner
- GitHub secret MASTER_FILE_KEY (the key in OneDrive "HPD Master File/MASTER_FILE_KEY.txt") turns on the
  nightly encrypted master file; until then it's written when run on this PC.
- Google reconnect with "read email" lets the phone confirm faxes by itself (the fax checker covers it).
- Status-server worker deploy needs Cloudflare Workers permission on the API token.
