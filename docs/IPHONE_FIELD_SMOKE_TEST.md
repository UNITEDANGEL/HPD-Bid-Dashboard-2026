# iPhone Field Smoke Test

Use this after each iPhone map/job-card change.

## Safe Test URL

Use the deployed preview or local server with the same query:

`/map/?omo=EQ31423&view=all&map=1&testFlow=1`

`testFlow=1` is an alias for `fieldFlowTest=1`. It keeps route-drawer status/media test actions local to the browser test path where supported.

## Required Map Checks

- `data-hpd-smoke="iphone-v2-screen"` exists.
- Real Leaflet map exists and has tiles.
- `data-hpd-smoke="iphone-v2-route"` clicks without showing stale `1 stop` or `Route leg loading`.
- Tapping blank map area collapses or keeps the card below full-screen.
- `data-hpd-smoke="iphone-v2-menu"` opens and closes the real map menu.

## Required Job Card Checks

- `iphone-v2-address`, `iphone-v2-contact`, `iphone-v2-scope`, `iphone-v2-itb`, and `iphone-v2-workflow` exist in that reading order.
- `iphone-v2-scope` opens `iphone-v2-scope-modal`; `iphone-v2-scope-close` closes it.
- `iphone-v2-open-itb` opens `iphone-v2-itb-modal` with the page image; `iphone-v2-itb-modal-close` closes it.
- `iphone-v2-waze`, `iphone-v2-google`, `iphone-v2-pdf-page`, and `iphone-v2-full-pdf` have real hrefs.

## Workflow Checks

- `iphone-v2-arrived` is either enabled or locked with a saved timestamp.
- `iphone-v2-start-visit` is enabled after Arrived and locked after saved.
- `iphone-v2-start-work` opens `iphone-v2-start-work-media`.
- Start-work media choices expose `iphone-v2-before-take-image`, `iphone-v2-before-take-video`, `iphone-v2-before-upload`, `iphone-v2-before-done`, and `iphone-v2-before-no-media`.
- `iphone-v2-no-access` opens `iphone-v2-no-access-media`.
- `iphone-v2-refused` opens `iphone-v2-refused-media`.
- `iphone-v2-clear` opens `iphone-v2-clear-confirm`; test should click `iphone-v2-clear-cancel`, not reset, unless the cycle explicitly needs a reset.

## Notes And Package Checks

- Notes controls exist: `iphone-v2-note-draft`, `iphone-v2-note-measurements`, `iphone-v2-note-material`, `iphone-v2-note-save`.
- Package controls are tested only after final status is ready:
  - `iphone-v2-package-panel`
  - `iphone-v2-package-with-signature`
  - `iphone-v2-package-no-signature`
  - `iphone-v2-package-pdf-only`
  - `iphone-v2-package-review`
  - `iphone-v2-package-approve`
  - `iphone-v2-package-send-zip`

## Paperwork Package Page Checks

Use `/paperwork/?job=EQ31423&outcome=work_completed&doc=package&auto=package&signature=none` only when testing package generation.

- Required page controls exist: `paperwork-package-page`, `paperwork-package-card`, `paperwork-map-link`, `paperwork-job-select`, and `paperwork-package-type`.
- Package type buttons exist: `paperwork-type-work` and `paperwork-type-no-work`.
- Generate buttons exist before preview: `paperwork-generate-full-package` and `paperwork-generate-pdf-only`.
- After generation, preview controls exist: `paperwork-package-review`, `paperwork-package-preview-panel`, `paperwork-open-pdf`, `paperwork-full-screen-pdf`, `paperwork-save-pdf`, and `paperwork-folder-contents`.
- Delivery controls may be inspected but not clicked during a normal smoke pass: `paperwork-share-files`, `paperwork-save-folder`, `paperwork-download-files`, `paperwork-share-zip`, `paperwork-save-zip`, `paperwork-share-application`, `paperwork-share-video`, and `paperwork-backup-send-files`.

Do not click send/share/download buttons during a normal smoke pass unless the user explicitly asks for that side effect.
