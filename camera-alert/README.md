# NYC Camera Alert

A phone web app that warns you as you approach NYC speed and red-light cameras, based on your current speed and distance. Camera data is downloaded by the phone itself when the app runs.

## What it does
- Pulls cameras from OpenStreetMap (speed, red-light, license-plate/Flock) and from NYC Open Data (discovered at runtime).
- Uses GPS speed and heading to find cameras ahead and speaks an alert ("Red-light camera 350 ft ahead at 35. Ease off now.").
- For red-light cameras it warns before the point where a comfortable stop (3 m/s² braking + 1 s reaction) is no longer possible at your speed.
- The Data card lists what each source returned, so you can see what is usable.
- "Simulate approach" plays a fake drive for testing.

## What it does not do
- It cannot see the signal color. NYC has no public live signal feed that we found.
- It does not tell you to stop or go at a yellow. It only warns early so you can slow down smoothly.

## Run it
Serve the folder over HTTPS (GPS requires it), e.g. GitHub Pages, Netlify, or Cloudflare Pages, then open the URL on your phone and "Add to Home Screen".
Locally: `npx serve camera-alert` works for desktop testing on localhost.

## Test
`node camera-alert/test.js`

## Known limits
- Browsers pause GPS and speech when the screen locks. The app asks to keep the screen on, but a native app is needed for true background alerts.
- OSM camera coverage in NYC is incomplete; NYC dataset schemas are unverified until run on a networked device.
