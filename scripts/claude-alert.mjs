// The phone alert when Claude finishes a request or needs the owner's answer (owner, 2 Nov: "I need to have a real live
// update with Claude all the time so I can do the upgrade easily from my app"): the app shows it while it's open; with
// the app closed only a phone alert reaches you. Sent once, when the status changes to Done or Waiting for you.
const short = (s, n) => { const t = String(s || "").replace(/^\((said to the helper|from the chat)\)\s*/i, "").replace(/\s+/g, " ").trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };

export function claudeAlert(oldStatus, reply, requestText) {
  const was = oldStatus || "Received";
  if (reply.status === was || !["Done", "Waiting for you"].includes(reply.status)) return null;
  const last = reply.updates?.length ? reply.updates[reply.updates.length - 1].text.split("\n")[0] : "";
  const ask = `“${short(requestText, 80)}”`;
  return reply.status === "Done"
    ? { title: "✅ Claude finished your request", body: last ? `${ask} ${short(last, 140)}` : ask, url: "/map/?view=all&map=1&requests=1" }
    : { title: "❓ Claude needs your answer", body: last ? `${ask} ${short(last, 140)}` : ask, url: "/map/?view=all&map=1&requests=1" };
}
