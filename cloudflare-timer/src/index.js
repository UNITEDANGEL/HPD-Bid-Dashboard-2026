// HPD invitation timer: every 10 minutes, Monday to Saturday, 7 AM to 7 PM New York time, starts the fetcher on GitHub
// (run-fetcher.yml), which reads new invitations to bid from Gmail and puts them on the live map.
// It runs in Cloudflare, so invitations keep coming in when the laptop is off, asleep or out of battery
// (13 Oct 2026: three invitations waited 2 hours while the laptop was off). GitHub's own schedule runs
// about once a day, so it can't be the timer. Needs the secret GITHUB_DISPATCH_TOKEN (a GitHub token
// that may start workflows on this repository); nothing else. Its web address only says what it is.
const REPO = "UNITEDANGEL/HPD-Bid-Dashboard-2026";
const WORKFLOW = "run-fetcher.yml";
// HPD's invitations and award emails arrive 7 AM - 7 PM (705 of 706 in Jun-Oct 2026; earliest 6:58 AM,
// latest 6:5x PM): first check 7 AM, last 7 PM, Monday to Saturday.
const FIRST_MINUTE = 7 * 60;
const LAST_MINUTE = 19 * 60;

export function newYorkMinute(date) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "numeric", hourCycle: "h23" }).formatToParts(date);
  const get = (t) => Number(parts.find((p) => p.type === t)?.value || 0);
  return get("hour") * 60 + get("minute");
}

export async function tick(env, now = new Date(), fetchImpl = fetch) {
  const minute = newYorkMinute(now);
  const at = `${Math.floor(minute / 60)}:${String(minute % 60).padStart(2, "0")}`;
  // Monday to Saturday, 7 AM - 7 PM New York (owner, 26 Oct: "too many API calls from Google, reduce them to 7 AM - 7 PM
  // Mon-Sat"). Each fetch reads Gmail and updates the site.
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short" }).format(now);
  if (weekday === "Sun") return { started: false, why: `Sunday: no fetch (${at})` };
  if (minute < FIRST_MINUTE || minute > LAST_MINUTE) return { started: false, why: `outside 7 AM - 7 PM (${at})` };
  // A pasted token can carry a line break or spaces: they'd break the request.
  const token = String(env.GITHUB_DISPATCH_TOKEN || "").replace(/\s+/g, "");
  if (!token) return { started: false, why: "GITHUB_DISPATCH_TOKEN is not set" };
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "hpd-invitation-timer",
  };
  const api = `https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}`;
  // A fetch already waiting to run will pick up anything new: don't pile up more.
  const queued = await fetchImpl(`${api}/runs?status=queued&per_page=1`, { headers });
  if (queued.ok && ((await queued.json()).total_count || 0) > 0) return { started: false, why: "a fetch is already waiting" };
  const res = await fetchImpl(`${api}/dispatches`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ ref: "main", inputs: { days_back: "14" } }),
  });
  if (res.status !== 204) throw new Error(`GitHub said ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return { started: true, why: `fetch started (${at})` };
}

export default {
  // A plain address so Cloudflare treats the timer as deployed; it starts nothing and shows no data.
  async fetch() {
    return new Response("HPD invitation timer: runs every 10 minutes, Monday to Saturday, 7 AM - 7 PM New York time.\n", { headers: { "content-type": "text/plain" } });
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil(tick(env, new Date(event.scheduledTime)).then((r) => console.log(r.why)));
  },
};
