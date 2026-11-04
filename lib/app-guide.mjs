// 📖 How HPD Field works, for the robot (owner, 4 Nov: "it should be able to answer any questions I have for my app ...
// it needs to be super smart"). Sent to the AI with every free question, so "how do I…", "where is…", "can the app…"
// get a real answer. Keep it current when a screen or button changes (plain words, no tenant data).
export const APP_GUIDE = `
THE MAP (home screen)
- Pins are jobs (blue house = work order, number badge = days open). Bid invitations show as bid pins when Bids is open.
- Top: search (job number or address, 🎤 to say it), filter, 🔔 alerts list (every alert is kept there), the borough chips
  (All, MN, BK, QN, BX, SI) and Year. Right side: Map (map style) and Locate (your position).
- Chips under the top: weather (tap = today and tomorrow), parking / alternate side, "job needs a check", the Next pill (the
  most pressing thing; tap to do it), the focus chip for the most urgent notice.
- Bottom buttons: Jobs, Bids, the 🤖 robot (middle), Notices, All. Press and hold Jobs / Bids / Notices to swap a button.
  All opens every screen: weather, parking, Today's route, follow-up tracker, stats, money, phone alerts, What's new.
- The chat bar above the buttons: type or 🎤 talk to the robot; ⚡ quick questions; 💡 ideas from Claude; 🔊 voice on/off.

THE ROBOT (🤖 button)
- Tap: it comes out talking (hello, what's waiting). Press and hold: walkie-talkie, it listens until you let go.
- ❓ by the robot = Claude (the developer) asked you something about a request; tap the robot, then ❓ Answer Claude.
- 🔁 by the robot = Keep upgrading is on (Claude builds the next idea by itself, up to 3 a day).
- In the chat: 🎙 keep talking, ⌨️ type, ❓ what can I say, 📷 read a photo, 🎨 dress it (color, hat, voice, speed,
  🔋 battery saver), 📋 your requests to Claude, 🚗 driving mode (short answers, keeps listening), ⇥ move it aside, ✕ close.
- Bubble over the robot = short news; tap it to hear the rest. Goal ring around it = today's bids sent out of today's bids.
- It walks to a job on the map when it talks about it; it dresses for the weather; naps at night (9 PM-7 AM).

JOBS AND THE JOB CARD (tap a pin or a job in Jobs)
- Shows HPD's work description, status, tenant contact (call / text), appointment, history, notes, photos, paperwork.
- Outcome buttons: Work completed, Refused access, No access (72-hour wait, then a 2nd try), Completed by others,
  Partly done / going back. Each records the date and makes the affidavit when needed.
- Photos: before and after (📸 photo check warns if blurry, dark or too bright; the robot says so right after a photo).
- 🔊 read the job out loud; then "walk me through it" (work items one by one, say "done") or "take me there" (Waze).
- Waze / Google buttons, 🚚 "on my way" text to the tenant, 🚪 "we're outside" text on arrival.
- Paperwork: affidavit (copy + original), invoice, the package to HPD / vendor tracking (never sent without two taps).

BIDS (invitations to bid)
- Bids opens with a hello: how many need a price, ▶ Start, 🎯 all in a row (goes to the next bid by itself after each send).
- The bid sheet: HPD's full description, price box (type or 🎤 say it), 💡 recommended price with the chance to win,
  🎯 win gauge (the needle moves as you type), 🧮 calculator, the package preview (price on page 1, page 2, Work
  Description Form), Send = fax to HPD by HumbleFax (two taps). NO BID fax too.
- Fax status: going through (pending), ✓ confirmed by HumbleFax, failed (resend / backup line). The pin shows it.
- "bid the usual" uses your usual price for that kind of work.

NOTICES (24 / 72-hour notices and missing documents from HPD: Lewis, Gafur)
- The board lists each notice with hours left (weekdays only: a notice from Friday is due Monday or Wednesday).
- Answer a notice: the AI drafts the reply with the dates; you read, edit, and send with two taps.
- Overdue notices ring once and stay on screen until you choose.

MONEY
- Payment rejections (invoice invalid etc.) with what to fix; held money; a warning when a payment is 30+ days late.
- Ask "how much does HPD owe me" or "how did I do this week".

ROUTE AND DAY
- Today's route: "plan my day" orders the stops (overdue, appointments, 2nd tries first, close together); "take me to the
  next stop". The little robot rides along to the next stop.
- ☀️ Start my day card in the morning (reads your day, plans the route); 🌆 wrap up card in the evening.
- "what do I need today" = materials for today's stops. "I'm running late" = a text to the tenant with your new time.
- Appointments: "make an appointment for <job> <day> at <time>"; tenants' replies come in as texts (💬).
- Reminders: "remind me to <what> <day> at <time>".

ALERTS AND SETTINGS
- Phone alerts (All -> Phone alerts): on from the Home Screen icon only on iPhone; each alert has its own sound; voice
  reads alerts out loud; pick the voice and speed. Quiet hours 9 PM-7 AM except notices and emergencies.
- What's new (All -> What's new): every change, newest first; Your requests: ask Claude for a change, see progress;
  💡 ideas (👍 Do it sends it to Claude); Keep upgrading ON / OFF.

GOOD TO KNOW
- Nothing goes to HPD (fax, email) without your two taps. Texts to tenants open Messages for you to send (or one tap).
- Claude is the developer: say "tell Claude to …" and it becomes a request in Your requests.
`.trim();
