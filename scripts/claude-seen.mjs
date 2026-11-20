// ✓ Seen within seconds (owner, 20 Nov: "make a better faster response from my phone to Claude"). A new request used to
// show nothing until Claude wrote its first note: 5 minutes on a good day, an hour or more when Claude was busy with
// another request. Now whoever is watching (the request watcher every 20 s, or the working chat session's inbox hook)
// answers right away: "Seen ✓", what Claude is doing, and the request's place in line. One write per new request.
const isOpen = (o, id) => !["Done", "Waiting for you"].includes(o[`CHANGE-REPLY-${id}`]?.status || "Received");
export const workingOn = (o, id, now = Date.now()) => {
  const w = o[`CHANGE-REPLY-${id}`]?.workingAt;
  return !!w && now - Date.parse(w) < 30 * 60000;
};

// The replies to write: [{ id, patch }] for each open request that has no reply at all yet.
export function seenReplies(o, now = Date.now()) {
  const ids = Object.keys(o || {}).filter((k) => k.startsWith("CHANGE-REQUEST-")).map((k) => k.slice(15)).sort();
  const open = ids.filter((id) => isOpen(o, id));
  const busy = open.filter((id) => workingOn(o, id, now));
  const queue = open.filter((id) => !workingOn(o, id, now));
  const at = new Date(now).toISOString();
  const short = (id) => String(o[`CHANGE-REQUEST-${id}`]?.text || "").replace(/^\((said to the helper|idea|auto upgrade|plan|from the chat)\)\s*/i, "").replace(/\s+/g, " ").slice(0, 60).trim();
  const out = [];
  for (const id of queue) {
    if (o[`CHANGE-REPLY-${id}`]) continue;
    const place = queue.indexOf(id) + 1;
    const doing = busy.length ? `Claude is working on "${short(busy[0])}"${busy.length > 1 ? ` and ${busy.length - 1} more` : ""} right now. ` : "";
    const text = place === 1
      ? `Seen ✓ ${doing}${busy.length ? "Yours is next: a second Claude starts on it within a minute or two." : "Claude is starting on it now."}`
      : `Seen ✓ ${doing}Yours is #${place} in line (oldest first). Quick questions get answered before big changes.`;
    out.push({ id, patch: { status: "Received", steps: [], workingAt: "", now: null, try: "", seen: at, updates: [{ at, text }] } });
  }
  return out;
}

export async function postSeen(url, o, now = Date.now()) {
  const list = seenReplies(o, now);
  for (const { id, patch } of list) {
    await fetch(`${url}/override`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: `CHANGE-REPLY-${id}`, patch }) }).catch(() => {});
  }
  return list.map((x) => x.id);
}
