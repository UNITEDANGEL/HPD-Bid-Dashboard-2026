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
2. [ ] **My location**: a clear, nice "you are here" marker; the map stays focused on where I am
3. [ ] **Photos and videos**: Before photo, Before video, After photo, After video; multiple shots; videos included in the package (Drive, plus email when they fit); photo dates editable (default today)
4. [ ] **Map pins**: colors you can read from far away: **blue = new**, **green = completed**, **red = refused**, **grey = no access**, **purple = completed by others**; a different icon per status; the pin you're zooming toward grows and glows
5. [ ] **Paperwork page polish**: aligned, neat, follows the procedure
6. [ ] **Automatic data checks** after every download: scan every job (description, ITB, address, dates, amounts) and show alerts in the app
7. [ ] **ER04964 and the other 4 jobs**: confirm the OCR run filled their real scopes
8. [ ] **iPhone speed**: make the app faster on mobile
9. [ ] **Better app link** (custom domain): needs a domain name from the owner
10. [ ] Notary stamp prints Chetanpreet Malhi's details: fine while she is the only notary

## How we work
- One item at a time: fix → test (including the real job that had the problem) → push live → screenshot to the owner
- Nothing goes out with a time on it, a blank-form description, or overlapping text
