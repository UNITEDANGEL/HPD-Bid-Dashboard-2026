// HPD invitation timer: every 10 minutes from 7 AM to 10 PM New York time, starts the fetcher on GitHub
// (run-fetcher.yml), which reads new invitations to bid from Gmail and puts them on the live map.
// It runs in Cloudflare, so invitations keep coming in when the laptop is off, asleep or out of battery
// (13 Oct 2026: three invitations waited 2 hours while the laptop was off). GitHub's own schedule runs
// about once a day, so it can't be the timer. Needs the secret GITHUB_DISPATCH_TOKEN (a GitHub token
// that may start workflows on this repository); nothing else, no public address.
const REPO = "UNITEDANGEL/HPD-Bid-Dashboard-2026";
const WORKFLOW = "run-fetcher.yml";
const FIRST_HOUR = 7;
const LAST_HOUR = 22; // last start 10:50 PM

export function newYorkHour(date) {
  return Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", hourCycle: "h23" }).format(date));
}

export async function tick(env, now = new Date(), fetchImpl = fetch) {
  const hour = newYorkHour(now);
  if (hour < FIRST_HOUR || hour > LAST_HOUR) return { started: false, why: `outside ${FIRST_HOUR} AM - 10 PM (hour ${hour})` };
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
  return { started: true, why: `fetch started (hour ${hour})` };
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(tick(env, new Date(event.scheduledTime)).then((r) => console.log(r.why)));
  },
};
