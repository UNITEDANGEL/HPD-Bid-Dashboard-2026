# iPhone Map + Job Card Design Samples

This file is the design decision file for the EQ31289 iPhone map/job-card work.

These are layout samples only. The final app must not embed these as a fake image or fake overlay. The final app must use the real map, real selected job data, and real button handlers.

![iPhone map and job card samples](design-samples/iphone-map-job-card-samples.png)

## Non-Negotiables

- Live map remains visible and usable at the top.
- Bottom job card is a real scrollable sheet, not a screenshot.
- Map pan/zoom and job-card scroll must work independently.
- No fake iPhone status bar, fake time, fake battery, or fake static map.
- No fake job data. Text, tenant, route, dates, and states come from the app data/state.
- Scope appears first.
- Tenant contact appears second.
- Workflow appears third.
- Workflow includes Arrived Saved, Start Visit, Start Work with tool visual, No Access, Refused, and Clear.
- Arrived Saved, Start Visit, and Start Work reserve visible date/time placement.
- No duplicate buttons.
- Route Me must use the real route/map behavior and show route, current location context, ETA, and distance on the top map when available.
- Remaining job-card details must stay reachable by fast native scrolling.

## Samples

### Sample 1 - Glass Sheet Command

Closest to the uploaded dark-glass look. The map remains visible behind the upper part of the sheet, and the workflow tiles are large and easy to hit.

Best when: visual match to the reference matters most.

Tradeoff: less map height than the route-first versions.

### Sample 2 - Route First Navigator

Gives more top map space and puts the route status above a compact card. Workflow uses wider rows so timestamp text has room.

Best when: routing and map interaction matter most.

Tradeoff: less dramatic glass-card look.

### Sample 3 - Fast Field Console

Keeps a sticky action strip near the top of the card, then scrolls details below it. Designed for quick field use.

Best when: fast tapping matters most.

Tradeoff: visually busier.

### Sample 4 - Two Step Bottom Sheet

Shows a route deck on the map and a medium-height bottom sheet. The card can expand with the handle for full job details.

Best when: we want a balanced iPhone feel with a clear drag sheet.

Tradeoff: workflow starts lower on the card.

### Sample 5 - Dense Field Mode

Minimizes scrolling and keeps everything compact. Scope, tenant, and workflow are visible with the least wasted space.

Best when: speed and no laggy long scroll matter most.

Tradeoff: less premium/glass visual polish.

### Sample 6 - Map Heavy Task Drawer

Prioritizes maximum map visibility. The drawer starts lower and can be pulled up for the full job card.

Best when: map panning/route visibility matters most.

Tradeoff: fewer workflow details visible at first glance.


## Improved Samples

![Improved iPhone map and job card samples](design-samples/iphone-map-job-card-samples-v2.png)

### Sample 7 - Premium Route Glass

Same dark-glass feeling as the uploaded reference, but cleaner spacing and no cramped workflow labels.

Best when: the app should feel premium and closest to the previous dark-glass mockup.

### Sample 8 - Timeline Workflow

Workflow is shown as a real visit timeline: Arrived Saved, Start Visit, Start Work, then exception actions.

Best when: field status clarity matters most.

### Sample 9 - Map First Pull Sheet

The map gets the most space, and the job card starts lower as a pull-up sheet.

Best when: route visibility and map interaction matter most.

### Sample 10 - Action Dock Glass

Scope and tenant stay clean at the top, with a compact action dock inside the sheet.

Best when: fast tapping and clean iPhone spacing matter most.
## Decision

Selected sample: Sample 7 - Premium Route Glass

After one sample is selected, the implementation plan is:

1. Remove unused fake mockup UI from the app path.
2. Keep the live map top visible and interactive.
3. Build the selected bottom-sheet layout using real React state and existing job data.
4. Wire every workflow button to the existing action behavior.
5. Wire Route Me to the existing real route/map behavior.
6. Test in the app browser at `http://127.0.0.1:3278/map/?omo=EQ31289&view=all&map=1`.
7. Verify iPhone-sized layout, no overlap, no duplicate buttons, fast card scroll, usable top map, and real button feedback.


