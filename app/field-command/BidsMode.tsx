"use client";
// Invitations to bid on the field map: the envelope button flips the map from your jobs to the open
// invitations (due today later than now, or later; from scripts/fetch_upcoming_bids.py). For each:
// read the job and the invitation, save your price (with help from your past winning bids), review
// the filled package (lib/bid-fill.ts) and send it to HPD's bid fax through HumbleFax. The fax is
// checked against HumbleFax's confirmation email and can be resent. "My bids" tracks every bid sent:
// won, not awarded or pending, and your win rate (lib/bid-records.ts).
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import SentBidStats from "./SentBidStats";
import { priceHelp, readScope, winChance, type PricedJob, bestPrice } from "../../lib/bid-price";
import { tradeOf, beats, bidStats, easyWin, historyRows, filterHistory, myPrices, workHistory, workKey, type Group, type HistoryFilter, type MarketJob, type MonthPoint, type WorkPrice } from "../../lib/bid-stats";
import type { UpcomingBid } from "../../lib/bid-fill";
import { HPD_STATUS_WORKER_URL } from "../../lib/paperwork";
import { bidHistory, currentRecord, earlierRounds, FAX_LINES, type FaxLine, bidResult, bidsToCheck, checkBidFax, faxState, mergeServerBidsAndKeep, readBidRecords, readSession, saveSession, SESSION_KEY, todaySummary, withLog, type BiddingSession, saveBidRecord, sendBidFax, winRate, type BidRecord } from "../../lib/bid-records";
import "./bids.css";
import BuildingFacts from "./BuildingFacts";
import { BuildingHero } from "./BuildingPhoto";
import ItbPages, { pagePictures } from "./ItbPages";
import { getPages } from "../../lib/page-cache";
import { bestWithFloor, floorKind, readFloors, saveFloor, type Floors } from "../../lib/cost-floor";
import { jobSummary, lineText, unitOf } from "../../lib/job-summary";
import { readRates, saveRate, unitWord, type Rates } from "../../lib/my-rates";
import { calcContext, calcPrice } from "../../lib/bid-calc";
import { COST_ITEMS, jobCost, profitAt, readCosts, saveCost, type Costs } from "../../lib/costs";
import { isNoBid, mergeServerNoBids, NO_BID_REASONS, readNoBids, saveNoBid, type NoBid } from "../../lib/no-bid";
import { buildingHistory } from "../../lib/building-bids";
import { bidChecklist, earlyDeadline, timeLeft, urgency } from "../../lib/bid-checklist";
import { itbPdfUrl, loadPrivate, withPrivate } from "../../lib/private-data";

const NY_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" });
const NY_TIME = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" });
const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const money2 = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const when = (iso?: string) => (iso ? NY_TIME.format(new Date(iso)) : "");

function dueLabel(bid: { bidDue: string; bidDueTime?: string }) {
  const [y, m, d] = bid.bidDue.split("-").map(Number);
  const weekday = new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
  return `${weekday} ${m}/${d}${bid.bidDueTime ? ` · ${bid.bidDueTime}` : ""}`;
}

function dueWhen(bid: UpcomingBid) {
  const today = NY_DAY.format(new Date());
  const days = Math.round((Date.parse(bid.bidDue) - Date.parse(today)) / 86400000);
  if (days <= 0) return { text: "due today", tone: "today" };
  if (days === 1) return { text: "due tomorrow", tone: "soon" };
  return { text: `due in ${days} days`, tone: "later" };
}

// Still open: due today later than now, or a future day (New York time). Past bids can't be sent.
const NY_CLOCK = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
function dueMinutes(time: string) {
  const m = /^(\d{1,2}):(\d{2})\s*([AP])M$/i.exec(time.trim());
  if (!m) return 24 * 60;
  return ((Number(m[1]) % 12) + (m[3].toUpperCase() === "P" ? 12 : 0)) * 60 + Number(m[2]);
}
export function stillOpen(bid: UpcomingBid, now = new Date()) {
  const today = NY_DAY.format(now);
  if (bid.bidDue !== today) return bid.bidDue > today;
  const [h, m] = NY_CLOCK.format(now).split(":").map(Number);
  return dueMinutes(bid.bidDueTime || "") > h * 60 + m;
}

const TONE_ORDER: Record<string, number> = { today: 0, soon: 1, later: 2 };
function byUrgency(a: UpcomingBid, b: UpcomingBid) {
  const ta = TONE_ORDER[dueWhen(a).tone], tb = TONE_ORDER[dueWhen(b).tone];
  if (ta !== tb) return ta - tb;
  const key = (x: UpcomingBid) => `${x.bidDue} ${x.bidDueTime.replace(/^(\d):/, "0$1:")}`;
  return key(a).localeCompare(key(b));
}

const FAX_TEXT = {
  saved: "", waiting: "📠 Faxed to HPD · waiting for HumbleFax's confirmation",
  confirmed: "✓ Fax confirmed by HumbleFax", failed: "✗ Fax failed: resend it", unconfirmed: "⚠ Sent, but no confirmation from HumbleFax after 15 minutes",
} as const;

// "3:00 PM" -> "0900" style key for sorting by time of day.
function minutesOf(time?: string) {
  const m = /^(\d{1,2}):(\d{2})\s*([AP])M$/i.exec(time || "");
  const n = m ? ((Number(m[1]) % 12) + (m[3].toUpperCase() === "P" ? 12 : 0)) * 60 + Number(m[2]) : 1439;
  return String(n).padStart(4, "0");
}

function badge(record?: BidRecord) {
  if (!record) return null;
  const state = faxState(record);
  if (state === "saved") return { text: `${money(record.price)} saved`, tone: "saved" };
  if (state === "failed") return { text: `Fax failed · resend ${money(record.sentPrice || record.price)}`, tone: "failed" };
  if (state === "confirmed") return { text: `✓ Fax confirmed · ${money(record.sentPrice || record.price)}`, tone: "sent" };
  return { text: `⏳ Fax going through · ${money(record.sentPrice || record.price)}${state === "unconfirmed" ? " · no answer yet" : ""}`, tone: "pending" };
}

export default function BidsMode({ open, map, history, onClose }: { open: boolean; map: any; history: PricedJob[]; onClose: () => void }) {
  const [bids, setBids] = useState<UpcomingBid[] | null>(null);
  // HPD's pages: signed in (private route answers), small page pictures on the list, one bid's pages full screen.
  const [privOk, setPrivOk] = useState(false);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [pagesFor, setPagesFor] = useState<UpcomingBid | null>(null);
  // Your own minimum per kind of work (lib/cost-floor): the best price never goes under it.
  const [floors, setFloors] = useState<Floors>({});
  const [floorEdit, setFloorEdit] = useState<string | null>(null);
  useEffect(() => { setFloors(readFloors()); }, []);
  // Your rates (per sq ft / door / window / part / job) -> "My price" from the job summary.
  const [rates, setRates] = useState<Rates>({});
  const [rateEdit, setRateEdit] = useState<Record<string, string>>({});
  // HPD's full description text is folded away by default (the page pictures above show the same words).
  const [showText, setShowText] = useState(false);
  useEffect(() => { setRates(readRates()); }, []);
  // Your costs (lib/costs): materials + labor per kind of work, and the trip; the calculator shows the profit.
  const [costs, setCosts] = useState<Costs>({});
  const [costEdit, setCostEdit] = useState<Record<string, { material: string; labor: string }>>({});
  useEffect(() => { setCosts(readCosts()); }, []);
  // No bid (lib/no-bid): decided not to bid this invitation, with a reason.
  const [noBids, setNoBids] = useState<Record<string, NoBid>>({});
  const [noBidAsk, setNoBidAsk] = useState(false);
  useEffect(() => { setNoBids(readNoBids()); }, []);
  const noBidOf = (b: { omo: string; bidDue: string }) => isNoBid(noBids, b);
  const [bidsReadAt, setBidsReadAt] = useState("");
  // Invitation PDFs the reader couldn't read (no OMO # or bid due date): shown, never dropped silently.
  const [unread, setUnread] = useState<{ file: string; omo?: string; why: string }[]>([]);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"open" | "mine" | "stats" | "history">("open");
  // The home screen's "Bid stats" opens straight on Stats (this stays mounted, so check each time it opens).
  useEffect(() => {
    if (!open) return;
    let asked: string | null = null;
    try { asked = sessionStorage.getItem("hpd-bids-tab"); sessionStorage.removeItem("hpd-bids-tab"); } catch {}
    if (asked === "stats" || asked === "history" || asked === "mine") setTab(asked);
  }, [open]);
  const [selected, setSelected] = useState<UpcomingBid | null>(null);
  const [records, setRecords] = useState<Record<string, BidRecord>>({});
  const [draft, setDraft] = useState("");
  const [reason, setReason] = useState("");
  // A sent bid is locked: its price changes only through "Revise this bid" (HPD already has it).
  const [revising, setRevising] = useState(false);
  // Two taps instead of confirm() boxes: iPhone Safari blocks those after a few, and the button then does nothing.
  const [armed, setArmed] = useState<"" | "send" | "send-7804" | "send-7805" | "revise" | "confirmed" | "self" | "high">("");
  // "Price saved" shown for a few seconds after saving.
  const [savedFlash, setSavedFlash] = useState(0);
  const [shareNote, setShareNote] = useState("");
  const [sentStats, setSentStats] = useState<{ byWork: { work: string; bids: number; won: number; winRate: number; lostAboveBy: number | null; lostAbovePct: number | null }[] } | null>(null);
  useEffect(() => {
    if (!open || sentStats) return;
    fetch("/data/bid_win_stats.json", { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)).then(setSentStats).catch(() => {});
  }, [open, sentStats]);
  // Mine: a bid whose invitation is closed opens its timeline and history right in the list.
  const [openRecord, setOpenRecord] = useState("");
  // Google connection (sending the fax goes through your Gmail): checked when the invitations open.
  const [google, setGoogle] = useState<{ connected: boolean; canEmail: boolean } | null>(null);
  useEffect(() => {
    if (!open) return;
    fetch("/api/drive/session", { cache: "no-store" }).then((r) => r.json()).then((d) => setGoogle({ connected: !!d?.connected, canEmail: !!d?.canEmail })).catch(() => {});
  }, [open]);
  // Description text size (remembered on this phone).
  const [bigText, setBigText] = useState(false);
  useEffect(() => { try { setBigText(localStorage.getItem("hpd-bid-text") === "xl"); } catch {} }, []);
  const [filled, setFilled] = useState<{ omo: string; price: number; previous?: number; url: string; name: string; file: File; bytes: Uint8Array } | null>(null);
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState("");
  const [fullText, setFullText] = useState(false);
  const [showSimilar, setShowSimilar] = useState(false);
  const [session, setSession] = useState<BiddingSession | null>(null);
  // The checklist opens by itself the first time you open bids each day; your open / closed choice is kept for the day.
  // Multi-bid sitting: the checklist's to-do bids one after another (OMOs in order), and what happened to each.
  const [sitting, setSitting] = useState<{ omos: string[]; at: number; skipped: string[]; done: boolean } | null>(null);
  const [checklistOpen, setChecklistOpen] = useState(() => {
    try { return localStorage.getItem(`hpd-checklist-${NY_DAY.format(new Date())}`) !== "closed"; } catch { return true; }
  });
  // The list is a panel over the map with three heights: "peek" (just its bar: the map shows, how it opens),
  // "half" and "full". Tap or drag the bar to change it.
  const [listSize, setListSize] = useState<"peek" | "half" | "full">("peek");
  const listCollapsed = listSize === "peek";
  const setListCollapsed = (v: boolean | ((x: boolean) => boolean)) => setListSize((cur) => ((typeof v === "function" ? v(cur === "peek") : v) ? "peek" : cur === "peek" ? "half" : cur));
  const dragRef = useRef<{ y: number; size: "peek" | "half" | "full" } | null>(null);
  // Which day's invitations to show: all, today, tomorrow or the day after (remembered on the phone).
  const [dayPick, setDayPick] = useState<"all" | "0" | "1" | "2">(() => {
    try { const v = localStorage.getItem("hpd-bids-day"); return v === "0" || v === "1" || v === "2" ? v : "all"; } catch { return "all"; }
  });
  useEffect(() => { try { localStorage.setItem("hpd-bids-day", dayPick); } catch { /* private mode */ } }, [dayPick]);
  // The list fills the screen below the header (the header's height changes with the warnings in it).
  const bannerRef = useRef<HTMLDivElement | null>(null);
  // Room for the list: the map area's height minus the header (both measured inside the map area).
  const [listRoom, setListRoom] = useState(0);
  useEffect(() => {
    const el = bannerRef.current;
    const area = el?.offsetParent as HTMLElement | null;
    if (!el || !area || typeof ResizeObserver === "undefined") return;
    const measure = () => setListRoom(Math.max(160, area.clientHeight - (el.offsetTop + el.offsetHeight) - 24 - 12));
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    ro.observe(area);
    measure();
    return () => ro.disconnect();
  }, [open]);
  const [clock, setClock] = useState(() => Date.now());
  const [market, setMarket] = useState<PricedJob[] | null>(null);
  const [marketJobs, setMarketJobs] = useState<MarketJob[]>([]);
  const layerRef = useRef<any>(null);

  // Bids saved on other phones (status server), as soon as the app opens and every 2 minutes. It can be
  // slow or busy: try up to 3 times. Fax checks wait for this first pull, so an old copy on this device
  // is never checked or saved over the newer one from another phone.
  const [pulled, setPulled] = useState(false);
  useEffect(() => {
    setRecords(readBidRecords());
    setSession(readSession());
    const tick = window.setInterval(() => setClock(Date.now()), 30000);
    let stopped = false;
    const pull = async (tries = 3) => {
      for (let i = 0; i < tries && !stopped; i++) {
        try {
          const r = await fetch(`${HPD_STATUS_WORKER_URL}/overrides`, { cache: "no-store" });
          const data = r.ok ? await r.json() : null;
          if (data?.overrides) {
            setRecords((local) => mergeServerBidsAndKeep(local, data.overrides));
            setNoBids((local) => mergeServerNoBids(local, data.overrides));
            const remote = data.overrides[SESSION_KEY] as BiddingSession | undefined;
            if (remote?.startedAt) setSession((mine) => (!mine || String(remote.endedAt || remote.startedAt) > String(mine.endedAt || mine.startedAt) ? remote : mine));
            break;
          }
        } catch { /* offline: try again */ }
        await new Promise((done) => setTimeout(done, 1500 * (i + 1)));
      }
      if (!stopped) setPulled(true);
    };
    void pull();
    const refresh = window.setInterval(() => void pull(1), 120000);
    return () => { stopped = true; window.clearInterval(refresh); window.clearInterval(tick); };
  }, []);
  useEffect(() => {
    if (!open) return;
    if (!market) {
      // What HPD paid for every invitation you received, whoever won (NYC Open Data, nightly).
      fetch("/data/market_awards.json", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => { setMarketJobs(Array.isArray(data?.jobs) ? data.jobs : []); return data; })
        .then((data) => setMarket(Array.isArray(data?.jobs) ? data.jobs.map((j: { omo: string; description: string; amount: number; awardDate: string; won: boolean; address?: string; area?: string; boro?: string }) => ({ id: j.omo, description: j.description, amount: j.amount, date: j.awardDate, won: j.won, address: [j.address, j.area || j.boro].filter(Boolean).join(" · ") })) : []))
        .catch(() => setMarket([]));
    }
    if (bids) return;
    Promise.all([fetch("/data/upcoming_bids.json", { cache: "no-store" }).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))), loadPrivate()])
      // HPD's notes with the tenant's contact come from the signed-in private route.
      .then(([raw, priv]) => { setPrivOk(!!priv); return [raw, priv] as const; })
      .then(([raw, priv]) => ({ ...raw, bids: Array.isArray(raw?.bids) ? withPrivate(raw.bids, priv?.bids) : raw?.bids }))
      .then((data) => { setBidsReadAt(String(data?.generatedAt || "")); setUnread(Array.isArray(data?.unread) ? data.unread : []); setBids(Array.isArray(data?.bids) ? data.bids.filter((b: UpcomingBid) => stillOpen(b)).sort(byUrgency) : []); })
      .catch(() => { setBids([]); setError("Couldn't load the invitations right now."); });
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const awarded = useMemo(() => new Map(history.filter((j) => j.amount > 0).map((j) => [j.id, j.amount])), [history]);
  // Awarded to anyone (open data): a bid of yours that shows here and isn't in your awards was lost.
  const marketAwards = useMemo(() => new Map((market || []).map((j) => [j.id, j.amount])), [market]);
  // Price help compares with every awarded job: other contractors' plus yours.
  const pricing = useMemo(() => {
    if (!market?.length) return history.map((j) => ({ ...j, won: true }));
    const seen = new Set(market.map((j) => j.id));
    return [...market, ...history.filter((j) => !seen.has(j.id)).map((j) => ({ ...j, won: true }))];
  }, [market, history]);
  const record = selected ? currentRecord(selected, records) : undefined;
  // Same OMO invited again: what you sent before. Same building, other jobs you bid recently.
  const rounds = selected ? earlierRounds(selected, records) : [];
  // Earlier HPD jobs at this building: winning price, won or not, your price when the app sent the bid.
  const buildingJobs = useMemo(() => {
    if (!selected || !marketJobs.length) return [];
    const yours: Record<string, number> = {};
    for (const r of Object.values(records)) if (r.status !== "saved" && (r.sentPrice || r.price)) yours[r.omo] = Number(r.sentPrice || r.price);
    return buildingHistory(selected, marketJobs, yours);
  }, [selected, marketJobs, records]);
  const sameBuilding = selected ? Object.values(records).filter((r) => r.omo !== selected.omo && r.address && r.address === selected.address && r.status !== "saved").sort((a, b) => String(b.sentAt).localeCompare(String(a.sentAt))).slice(0, 3) : [];

  const stats = useMemo(() => (marketJobs.length ? bidStats(marketJobs) : null), [marketJobs]);
  const dayKeys = useMemo(() => [0, 1, 2].map((n) => NY_DAY.format(new Date(clock + n * 86400000))), [clock]);
  const shownBids = useMemo(() => (bids || []).filter((b) => dayPick === "all" || b.bidDue === dayKeys[Number(dayPick)]), [bids, dayPick, dayKeys]);
  // HPD's pages load fast: the job-description page of every bid already drawn on this phone shows as a small
  // picture on its row; the next bids due are drawn ahead (one at a time, after the list shows), so opening
  // them is instant.
  useEffect(() => {
    if (!open || !privOk || !bids?.length) return;
    let live = true;
    const made: string[] = [];
    const descPage = (b: UpcomingBid) => (b.descPages?.length ? b.descPages[0] : 3);
    const show = (omo: string, blob: Blob) => { if (!live) return; const u = URL.createObjectURL(blob); made.push(u); setThumbs((t) => (t[omo] ? t : { ...t, [omo]: u })); };
    const withFile = bids.filter((b) => b.itbFile);
    (async () => {
      for (const b of withFile) {
        const kept = await getPages(itbPdfUrl(b.itbFile!), [descPage(b)]);
        const blob = kept.get(descPage(b));
        if (blob) show(b.omo, blob);
      }
      await new Promise((r) => setTimeout(r, 1500));
      for (const b of withFile.slice(0, 8)) {
        if (!live) return;
        try {
          const pics = await pagePictures(itbPdfUrl(b.itbFile!), Array.from({ length: b.pages || 3 }, (_, i) => i + 1)); // every page (the card shows them all)
          const d = pics.find((p) => p.page === descPage(b));
          if (d) show(b.omo, d.blob);
        } catch {
          // not signed in any more / PDF missing: the bid card says so when opened
        }
      }
    })();
    return () => { live = false; made.forEach((u) => URL.revokeObjectURL(u)); setThumbs({}); };
  }, [open, privOk, bids]);
  // A day with nothing left to bid (e.g. today after the 11 AM bids): show all of them instead of an empty list.
  useEffect(() => {
    if (bids && bids.length && dayPick !== "all" && !shownBids.length) setDayPick("all");
  }, [bids, dayPick, shownBids.length]);
  // Open invitations that are easy wins (work you win well under what other winners get).
  // Each row: the job at a glance, and My price when your rates cover every line.
  const rowSummary = useMemo(() => new Map((bids || []).map((b) => [b.omo, jobSummary(b.description)])), [bids]);
  const rowHelp = useMemo(() => new Map((bids || []).map((b) => [b.omo, market?.length ? priceHelp(b.description, pricing) : null])), [bids, market, pricing]);
  const easyOmos = useMemo(() => new Set((bids || []).filter((b) => stats && easyWin(b.description, stats.workPrices)).map((b) => b.omo)), [bids, stats]);

  const alertOmos = useMemo(() => {
    const day = NY_DAY.format(new Date(clock));
    const hm = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(clock)).split(":").map(Number);
    const t = todaySummary(bids || [], records, day, hm[0] * 60 + hm[1], new Date(clock), (b) => !!noBidOf(b));
    return new Set(t.notSent.filter((r) => r.minutesLeft <= 180).map((r) => r.omo));
  }, [bids, records, clock]);
  const alertKey = [...alertOmos].sort().join();

  // Pins: blue hourglass while a fax goes through, green check once HumbleFax confirms, red ! if it
  // failed or a bid due within 3 hours isn't sent; a green ring and $ for an easy win. The job pins are hidden while the map shows bids.
  useEffect(() => {
    if (!map) return;
    map.getContainer?.()?.classList.toggle("is-bids", open);
    layerRef.current?.remove();
    layerRef.current = null;
    if (!open || !bids?.length) return;
    let cancelled = false;
    import("leaflet").then((mod) => {
      if (cancelled) return;
      const L = (mod as any).default || mod;
      const pane = map.getPane("fc-bids") || map.createPane("fc-bids");
      pane.style.zIndex = "640";
      const markers = shownBids.filter((b) => Number.isFinite(b.lat) && Number.isFinite(b.lng)).map((bid) => {
        const tone = dueWhen(bid).tone;
        const tone2 = badge(currentRecord(bid, records))?.tone;
        const sent = tone2 === "sent";
        const pendingFax = tone2 === "pending";
        const faxFailed = tone2 === "failed";
        const alertPin = alertOmos.has(bid.omo);
        const easyPin = !sent && !currentRecord(bid, records) && easyOmos.has(bid.omo);
        const noBidPin = !sent && !pendingFax && !!noBidOf(bid);
        return L.marker([bid.lat, bid.lng], {
          pane: "fc-bids", title: `${bid.omo} · ${bid.address} · ${dueLabel(bid)}${easyPin ? " · Easy win" : ""}`,
          icon: L.divIcon({ className: `fc-bid-pin is-${tone}${noBidPin ? " is-nobid" : ""}${sent ? " is-sent" : ""}${pendingFax ? " is-pending" : ""}${faxFailed ? " is-fax-failed" : ""}${alertPin ? " is-alert" : ""}${easyPin ? " is-easy" : ""}`, html: `<b>${noBidPin ? "🚫" : sent ? "✓" : pendingFax ? "⏳" : faxFailed || alertPin ? "!" : dueLabel(bid).split(" ")[0]}</b>${easyPin ? "<i>$</i>" : ""}`, iconSize: [34, 34], iconAnchor: [17, 17] }),
          zIndexOffset: 1000 - TONE_ORDER[tone] * 100,
        }).on("click", () => openBid(bid));
      });
      if (!markers.length) return;
      layerRef.current = L.featureGroup(markers).addTo(map);
      // Fit the pins in the map you can actually see: below the header, above the list's bar, left of the buttons.
      const area = map.getContainer().getBoundingClientRect();
      const banner = bannerRef.current?.getBoundingClientRect();
      const top = banner ? Math.max(20, banner.bottom - area.top + 16) : 120;
      const room = area.height - top - 90;
      map.fitBounds(layerRef.current.getBounds(), { paddingTopLeft: [24, Math.min(top, Math.max(20, area.height - 200))], paddingBottomRight: [90, room > 120 ? 90 : 30], maxZoom: 14 });
    });
    return () => { cancelled = true; };
  }, [open, bids, map, records, easyOmos, alertKey, shownBids, noBids]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { layerRef.current?.remove(); map?.getContainer?.()?.classList.remove("is-bids"); }, [map]);

  // HumbleFax emails a confirmation (or a failure) a few minutes after each fax: check Gmail for every
  // bid still waiting, now and every minute, whether or not its sheet is open, so the map and list
  // show sent / confirmed / failed by themselves.
  const recordsRef = useRef(records);
  recordsRef.current = records;
  const [faxCheckNote, setFaxCheckNote] = useState("");
  useEffect(() => {
    if (!pulled) return;
    let stopped = false;
    const checkAll = async () => {
      for (const rec of bidsToCheck(recordsRef.current)) {
        if (stopped) return;
        const result = await checkBidFax(rec.omo, rec.sentAt!);
        if (result.status === "confirmed" || result.status === "failed") {
          const latest = recordsRef.current[rec.omo];
          if (latest && latest.sentAt === rec.sentAt && latest.status === "sent") {
            await update(withLog({ ...latest, status: result.status, confirmedAt: result.at, faxNote: result.subject, updatedAt: new Date().toISOString() }, result.status === "confirmed" ? "HumbleFax: Successful Transmission" : `HumbleFax: FAX FAILED (${result.subject})`, result.at || new Date().toISOString()));
          }
          setFaxCheckNote("");
        } else if (result.status === "unknown") {
          setFaxCheckNote(result.noReadAccess ? "read" : result.error || "");
          if (result.noReadAccess) return; // same answer for every bid
        } else {
          setFaxCheckNote("");
        }
      }
    };
    void checkAll();
    const timer = window.setInterval(() => void checkAll(), 60000);
    return () => { stopped = true; window.clearInterval(timer); };
  }, [pulled, Object.values(records).filter((r) => r.status === "sent").map((r) => r.omo + r.sentAt).join()]); // eslint-disable-line react-hooks/exhaustive-deps

  const help = useMemo(() => (selected ? priceHelp(selected.description, pricing) : null), [selected, pricing]);
  // Since mid-September most lost bids were far above the winner (lock / latch about double): a price that
  // would win fewer than 1 in 4 similar jobs gets a clear warning, and saving it takes a second tap.
  const draftNumber = Number(String(draft).replace(/[^0-9.]/g, ""));
  const selKind = selected ? floorKind(selected.description) : "";
  const selFloor = selKind ? floors[selKind] : undefined;
  useEffect(() => { setFloorEdit(null); }, [selected?.omo]);
  useEffect(() => { setArmed((a) => (a === "high" ? "" : a)); }, [draft]); // a new price needs its own second tap
  const highPrice = useMemo(() => {
    if (!help || !(draftNumber > 0) || help.prices.length < 5) return null;
    const chance = Math.round(winChance(help, draftNumber) * 100);
    const best = bestWithFloor(help, selFloor);
    if (chance >= 25 || draftNumber <= best.price) return null;
    return { chance, best: best.price, bestChance: Math.round(winChance(help, best.price) * 100), n: help.prices.length };
  }, [help, draftNumber, selFloor]);
  // More than 15% above the best price (but not as bad as above): a softer note. Since Nov 2025 half of
  // your bids were more than 15% above the best price, and those won far fewer jobs (Stats).
  const abovePrice = useMemo(() => {
    if (highPrice || !help || !(draftNumber > 0) || help.prices.length < 5) return null;
    const best = bestWithFloor(help, selFloor);
    if (draftNumber <= best.price * 1.15) return null;
    return { pct: Math.round((draftNumber / best.price - 1) * 100), chance: Math.round(winChance(help, draftNumber) * 100), best: best.price, bestChance: Math.round(winChance(help, best.price) * 100) };
  }, [help, draftNumber, highPrice, selFloor]);
  const scope = useMemo(() => readScope(selected?.description || ""), [selected]);
  const summary = useMemo(() => jobSummary(selected?.description || ""), [selected]);
  // Bid calculator: your rates + extras (floors, locations, borough), lines changed for this job, +/- %.
  const [calcOverride, setCalcOverride] = useState<Record<string, number>>({});
  const [calcAdjust, setCalcAdjust] = useState(0);
  // Filled out already (owner, 16 Oct): the bid form is filled in when the invitation opens (no price: the owner
  // types it); saving the price makes the final bid document at once.
  const [draftDoc, setDraftDoc] = useState<{ omo: string; url: string } | null>(null);
  const [autoFill, setAutoFill] = useState(false);
  const [overrideEdit, setOverrideEdit] = useState<{ key: string; value: string } | null>(null);
  const calc = useMemo(() => calcPrice(summary, rates, calcContext(summary, scope.tasks, selected?.borough || ""), calcOverride, calcAdjust), [summary, rates, scope.tasks, selected?.borough, calcOverride, calcAdjust]);
  const myCalc = { total: calc.total, complete: calc.complete, missing: calc.missing };
  // The bid form filled in when the invitation opens (company, owner, address, phone, dates, description), with the
  // price left for the owner: no automatic price (owner, 16 Oct).
  useEffect(() => {
    if (!selected?.itbFile || currentRecord(selected, records) || draftDoc?.omo === selected.omo) return;
    let live = true;
    const bid = selected;
    (async () => {
      try {
        const [{ fillBidPackage }, pdf] = await Promise.all([import("../../lib/bid-fill"), fetch(itbPdfUrl(bid.itbFile!)).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`HTTP ${r.status}`))))]);
        const bytes = await fillBidPackage(pdf, bid, 0, undefined, { noPrice: true });
        if (!live) return;
        setDraftDoc((old) => { if (old) URL.revokeObjectURL(old.url); return { omo: bid.omo, url: URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" })) }; });
      } catch { /* not signed in / no PDF: the form is filled when the price is saved */ }
    })();
    return () => { live = false; };
  }, [selected?.omo, records]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setRateEdit({}); setNoBidAsk(false); setCalcOverride({}); setCalcAdjust(0); setOverrideEdit(null); }, [selected?.omo]);
  const markNoBid = async (reason: string | null) => {
    if (!selected) return;
    const nb: NoBid = { omo: selected.omo, bidDue: selected.bidDue, reason: reason || "", at: new Date().toISOString(), ...(reason === null ? { undone: true } : {}) };
    setNoBids(await saveNoBid(nb, HPD_STATUS_WORKER_URL));
    setNoBidAsk(false);
  };
  const easy = useMemo(() => (selected && stats ? easyWin(selected.description, stats.workPrices) : null), [selected, stats]);
  const descriptions = useMemo(() => new Map<string, string>([...marketJobs.map((j) => [j.omo, j.description] as [string, string]), ...(bids || []).map((b) => [b.omo, b.description] as [string, string])]), [marketJobs, bids]);
  const learned = useMemo(() => myPrices(Object.values(records), (omo) => descriptions.get(omo)), [records, descriptions]);
  const mineForThis = useMemo(() => (selected ? (learned.get(workKey(selected.description)) || []).filter((p) => p.omo !== selected.omo) : []), [selected, learned]);
  const draftValue = Number(String(draft).replace(/[^0-9.]/g, ""));

  async function update(next: BidRecord) {
    setRecords(await saveBidRecord(next, HPD_STATUS_WORKER_URL));
  }

  function openBid(bid: UpcomingBid) {
    setFullText(false);
    setShowSimilar(false);
    setNote("");
    setBusy("");
    setSelected(bid);
    const yourLast = (learned.get(workKey(bid.description)) || []).find((p) => p.omo !== bid.omo);
    const cur = currentRecord(bid, records);
    const before = earlierRounds(bid, records)[0];
    setDraft(cur ? String(cur.price) : before ? String(before.price) : yourLast ? String(yourLast.price) : "");
    setRevising(false);
    setArmed("");
    setReason(currentRecord(bid, records)?.reason || records[bid.omo]?.reason || "");
  }

  async function savePrice() {
    if (!selected || !(draftValue > 0)) return;
    const now = new Date().toISOString();
    const stored = records[selected.omo];
    const previous = currentRecord(selected, records);
    // Invited again: the earlier round is kept, this round starts as "saved".
    const newRound = stored && !previous ? {
      attempts: 0, rounds: [...(stored.rounds || []), { bidDue: stored.bidDue, price: stored.sentPrice || stored.price, sentAt: stored.sentAt, status: stored.status }],
      log: [...(stored.log || []), { at: now, what: `Invited again (due ${selected.bidDue}); before you sent ${money2(stored.sentPrice || stored.price)} for ${stored.bidDue}` }],
    } : null;
    const why = reason.trim().slice(0, 200) || undefined;
    const base = {
      ...(previous || newRound || { attempts: 0 }), omo: selected.omo, address: selected.address, borough: selected.borough,
      bidDue: selected.bidDue, bidDueTime: selected.bidDueTime, price: draftValue, savedAt: now,
      status: previous && previous.status !== "saved" ? previous.status : "saved", updatedAt: now,
      reason: why,
    } as BidRecord;
    const what = previous && previous.price === draftValue ? `Reason saved: "${why || ""}"` : `Price saved ${money2(draftValue)}${why ? ` ("${why}")` : ""}`;
    await update(withLog(base, what, now));
    setAutoFill(true); // the bid document is made right away (no separate Fill tap)
    setSavedFlash(Date.now());
    window.setTimeout(() => setSavedFlash(0), 6000);
    if (filled && filled.price !== draftValue) setFilled(null);
  }

  async function buildPackage(price: number) {
    if (!selected) return null;
    const [{ fillBidPackage }, pdf] = await Promise.all([
      import("../../lib/bid-fill"),
      fetch(itbPdfUrl(selected.itbFile)).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`invitation PDF: HTTP ${r.status}`)))),
    ]);
    const previous = revisedFrom(records[selected.omo]);
    const rec = records[selected.omo];
    const bytes = await fillBidPackage(pdf, selected, price, previous ? { previousPrice: previous, count: (rec?.revisions?.length || 0) + 1, date: NY_DAY.format(new Date()) } : undefined);
    const name = `${selected.omo}_${previous ? "REVISED_" : ""}BID_${Math.round(price)}_${selected.address.replace(/[^A-Z0-9]+/gi, "-")}.pdf`;
    const file = new File([bytes as BlobPart], name, { type: "application/pdf" });
    const old = filled;
    const ready = { omo: selected.omo, price, previous, url: URL.createObjectURL(file), name, file, bytes };
    setFilled(ready);
    // The previous copy stays openable a little longer (it may be open in a tab right now).
    if (old) window.setTimeout(() => URL.revokeObjectURL(old.url), 60000);
    return ready;
  }

  async function review() {
    if (!record) return;
    if (busy === "Filling the bid package…") return; // already being made (saving the price starts it)
    setBusy("Filling the bid package…");
    try {
      await buildPackage(record.price);
      const filledNow = new Date().toISOString();
      await update(withLog({ ...record, filledAt: filledNow, filledPrice: record.price, updatedAt: filledNow }, `Package filled at ${money2(record.price)}${revisedFrom(record) ? ` (revised from ${money2(revisedFrom(record)!)})` : ""}`));
      setBusy("");
    } catch (err) { setBusy(`Couldn't fill it: ${err instanceof Error ? err.message : String(err)}`); }
  }

  useEffect(() => {
    if (!autoFill || !record || !(record.price > 0) || record.status !== "saved") return;
    if (filled && filled.price === record.price) { setAutoFill(false); return; }
    setAutoFill(false);
    void review();
  }, [autoFill, record]); // eslint-disable-line react-hooks/exhaustive-deps

  async function send(line: FaxLine = "main") {
    if (!selected || !record || !filled || filled.price !== record.price) return;
    const again = record.status !== "saved";
    const previous = revisedFrom(record);
    if (previous && filled.previous !== previous) return;
    const armKey = line === "main" ? "send" : `send-${line}`;
    if (armed !== armKey) { setArmed(armKey as typeof armed); return; } // first tap: the button asks to tap again
    setArmed("");
    void again;
    setBusy("Sending the fax…");
    const lineLabel = FAX_LINES.find((l) => l.id === line)!.label;
    const result = await sendBidFax(selected, record.price, filled.bytes, filled.name, fetch, previous, line);
    if (!result.ok) {
      setBusy(`Not sent: ${result.error}`);
      await update(withLog({ ...record, updatedAt: new Date().toISOString() }, `Fax NOT sent to ${lineLabel}: ${result.error}`));
      return;
    }
    const revisions = previous ? [...(record.revisions || []), { price: previous, sentAt: record.sentAt }] : record.revisions;
    const attempts = (record.attempts || 0) + 1;
    await update(withLog({ ...record, status: "sent", sentAt: result.sentAt, sentPrice: record.price, priorPrice: undefined, revisions, faxTo: result.to, messageId: result.messageId, confirmedAt: undefined, faxNote: undefined, attempts, updatedAt: new Date().toISOString() },
      previous ? `Revised fax sent to HPD ${lineLabel}: ${money2(previous)} → ${money2(record.price)}` : `Fax sent to HPD ${lineLabel} at ${money2(record.price)}${attempts > 1 ? ` (send ${attempts})` : ""}`, result.sentAt));
    setRevising(false);
    setBusy("");
  }

  async function markConfirmed() {
    if (!record) return;
    if (armed !== "confirmed") { setArmed("confirmed"); return; }
    setArmed("");
    const now = new Date().toISOString();
    await update(withLog({ ...record, status: "confirmed", confirmedAt: now, faxNote: "Confirmed by you from HumbleFax's email", updatedAt: now }, "Confirmed by you from HumbleFax's email", now));
    setNote("");
  }

  // You faxed / emailed this bid yourself (Gmail to HumbleFax, or another fax): record it as sent at the saved price.
  async function markSentElsewhere() {
    if (!record) return;
    if (armed !== "self") { setArmed("self"); return; }
    setArmed("");
    const now = new Date().toISOString();
    await update(withLog({ ...record, status: "sent", sentAt: now, sentPrice: record.price, priorPrice: undefined, faxTo: "sent by you", attempts: (record.attempts || 0) + 1, updatedAt: now },
      `Sent by you outside the app (Gmail / fax) at ${money2(record.price)}`, now));
    setBusy("");
  }

  async function startSession() {
    const s2 = { active: true, startedAt: new Date().toISOString(), day: NY_DAY.format(new Date()) };
    setSession(s2);
    await saveSession(s2, HPD_STATUS_WORKER_URL);
  }
  async function endSession() {
    if (!session) return;
    const s2 = { ...session, active: false, endedAt: new Date().toISOString() };
    setSession(s2);
    await saveSession(s2, HPD_STATUS_WORKER_URL);
  }

  async function share() {
    if (!filled) return;
    setShareNote("");
    const data = { files: [filled.file], title: filled.name };
    try {
      if (navigator.canShare?.(data)) { await navigator.share(data); return; }
    } catch (error) {
      if ((error as { name?: string })?.name === "AbortError") return; // you closed the share sheet
    }
    // No share sheet here (or it refused): open the PDF; from there use the iPhone's share icon.
    const opened = window.open(filled.url, "_blank");
    setShareNote(opened ? "Opened the package: use the share icon there (Mail, Gmail, Files)." : "Sharing isn't available here: tap Save, then share it from the Files app.");
  }

  if (!open) return null;
  const list = bids || [];
  const mine = Object.values(records).sort((a, b) => b.bidDue.localeCompare(a.bidDue) || b.updatedAt.localeCompare(a.updatedAt));
  const today = NY_DAY.format(new Date());
  const rate = winRate(mine, awarded, today, marketAwards);
  const sentCount = mine.filter((r) => r.status !== "saved").length;
  const state = record ? faxState(record) : "saved";
  const reviewedSaved = filled && record && filled.omo === record.omo && filled.price === record.price && filled.previous === revisedFrom(record) ? filled : null;
  const nyNow = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(clock)).split(":").map(Number);
  const todayInfo = todaySummary(list, records, today, nyNow[0] * 60 + nyNow[1], new Date(clock), (b) => !!noBidOf(b));
  // Morning checklist: every invitation due today or tomorrow, its state and the best price (lib/bid-checklist.ts).
  const tomorrowDay = NY_DAY.format(new Date(clock + 86400000));
  // Open a bid from the checklist; not priced yet: start from the best price (not your last price for this kind of work).
  function openFromChecklist(omo: string) {
    const bid = (bids || []).find((b) => b.omo === omo);
    if (!bid) return;
    const row = checklist.rows.find((r) => r.omo === omo);
    openBid(bid);
    if (row && row.state === "not-priced" && row.best) setDraft(String(row.best));
  }
  function startSitting() {
    const omos = checklist.todo.map((r) => r.omo);
    if (!omos.length) return;
    setSitting({ omos, at: 0, skipped: [], done: false });
    setChecklistOpen(false);
    openFromChecklist(omos[0]);
  }
  // Next bid in the sitting that still needs a bid (skips ones sent meanwhile); none left: the summary.
  function nextInSitting(skip: boolean) {
    if (!sitting) return;
    const skipped = skip && selected ? [...sitting.skipped, selected.omo] : sitting.skipped;
    const stillToDo = new Set(checklist.todo.map((r) => r.omo));
    let at = sitting.at + 1;
    while (at < sitting.omos.length && !stillToDo.has(sitting.omos[at])) at += 1;
    if (at >= sitting.omos.length) {
      setSitting({ ...sitting, skipped, at: sitting.omos.length, done: true });
      setSelected(null);
      setChecklistOpen(true);
      return;
    }
    setSitting({ ...sitting, skipped, at });
    openFromChecklist(sitting.omos[at]);
  }
  const checklist = bidChecklist(bids || [], records, today, tomorrowDay, nyNow[0] * 60 + nyNow[1], new Date(clock), (omo) => {
    const h = rowHelp.get(omo);
    if (!h) return null;
    const b = bestWithFloor(h, floors[floorKind((bids || []).find((x) => x.omo === omo)?.description || "")]);
    return { best: b.price, chance: b.chance };
  }, easyOmos, (b) => !!noBidOf(b));
  const sessionOn = !!session?.active && session.day === today;
  const leftText = (m: number) => (m <= 0 ? "past due" : m < 60 ? `${m} min left` : `${Math.floor(m / 60)}h ${m % 60}m left`);
  const step1Done = !!record && draftValue === record.price;
  const step3Done = !!record && record.status !== "saved" && record.sentPrice === record.price && !revisedFrom(record);
  // Sent and not being revised: the price is locked. Confirmed by HumbleFax: the package is too (no casual resend).
  const sentLocked = !!record && record.status !== "saved" && !revisedFrom(record) && !revising;
  const faxLocked = sentLocked && state === "confirmed";
  const pickPrice = (v: string) => { if (!sentLocked) setDraft(v); };
  async function startRevision() {
    if (!record || !selected) return;
    const has = record.sentPrice || record.price;
    if (armed !== "revise") { setArmed("revise"); return; }
    setArmed("");
    setRevising(true);
    await update(withLog({ ...record, updatedAt: new Date().toISOString() }, `Revision started (HPD has ${money2(has)})`));
  }
  async function cancelRevision() {
    if (!record) return;
    setRevising(false);
    setDraft(String(record.price));
    await update(withLog({ ...record, updatedAt: new Date().toISOString() }, "Revision cancelled: nothing new sent"));
  }

  return (
    <>
      <div className="fc-bids-banner" ref={bannerRef} data-hpd-smoke="fc-bids-banner">
        <strong>📨 Invitations to bid</strong>
        <span>{bids === null ? "Loading…" : error || `${list.length} open to bid · due today or later${list.some((b) => !Number.isFinite(b.lat)) ? ` · ${list.filter((b) => !Number.isFinite(b.lat)).length} without a map spot` : ""}`}{bids ? <small className="fc-bids-read" data-hpd-smoke="fc-bids-today"> · {bids.filter((b) => b.receivedAt && new Date(b.receivedAt).toLocaleDateString("en-US", { timeZone: "America/New_York" }) === new Date().toLocaleDateString("en-US", { timeZone: "America/New_York" })).length} received today</small> : null}{bidsReadAt ? <small className="fc-bids-read" data-hpd-smoke="fc-bids-read"> · emails last checked {new Date(bidsReadAt).toLocaleString("en-US", { timeZone: "America/New_York", weekday: "short", hour: "numeric", minute: "2-digit" })}</small> : null}</span>
        {unread.length ? <p className="fc-bids-unread" role="alert" data-hpd-smoke="fc-bids-unread">⚠️ {unread.length} invitation{unread.length > 1 ? "s" : ""} couldn&apos;t be read, open in your email: {unread.map((u) => `${u.omo || u.file} (${u.why})`).join(", ")}</p> : null}
        <button type="button" data-hpd-smoke="fc-bids-close" onClick={() => { setSelected(null); onClose(); }}>Back to jobs</button>
        {google && (!google.connected || !google.canEmail) ? <ReconnectGoogle text={google.connected ? "Google is connected but can't send email: reconnect and allow sending email." : "Google isn't connected: bids can't be faxed until you reconnect."} /> : null}
        <div className="fc-bids-days" role="group" aria-label="Which day" data-hpd-smoke="fc-bids-days">
          {([["all", "All"], ["0", "Today"], ["1", "Tomorrow"], ["2", new Date(`${dayKeys[2]}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "numeric", day: "numeric" })]] as const).map(([key, label]) => {
            const dayList = key === "all" ? list : list.filter((b) => b.bidDue === dayKeys[Number(key)]);
            const first = [...dayList].sort((a, b) => (a.bidDue + minutesOf(a.bidDueTime)).localeCompare(b.bidDue + minutesOf(b.bidDueTime)))[0];
            return (
              <button key={key} type="button" className={dayPick === key ? "is-active" : ""} aria-pressed={dayPick === key} data-hpd-smoke={`fc-bids-day-${key}`} onClick={() => setDayPick(key)}>
                <b>{label}</b> <span>{dayList.length}</span>{key !== "all" && first ? <small>first due {first.bidDueTime}</small> : null}
              </button>
            );
          })}
        </div>
      </div>
      {selected ? (
        <div className="fc-bid-sheet" role="dialog" aria-label={`Invitation ${selected.omo}`} data-hpd-smoke="fc-bid-sheet">
          <header>
            <button type="button" onClick={() => setSelected(null)}>← All bids</button>
            <strong>{selected.omo}</strong>
            {/* Back to the map, centred on this building (the list folds away; "Show the list" brings it back). */}
            <button type="button" className="fc-bid-to-map" data-hpd-smoke="fc-bid-to-map" onClick={() => {
              const b = selected;
              setSelected(null);
              setListCollapsed(true);
              if (Number.isFinite(b.lat) && Number.isFinite(b.lng)) map?.setView?.([b.lat, b.lng], 16);
            }}>🗺 Map</button>
          </header>
          {sitting && !sitting.done && sitting.omos[sitting.at] === selected.omo ? (() => {
            const st = record ? faxState(record) : "";
            const sentNow = st === "waiting" || st === "confirmed" || st === "unconfirmed";
            const last = sitting.at >= sitting.omos.length - 1;
            return (
              <div className={`fc-sitting-bar${sentNow ? " is-sent" : ""}`} data-hpd-smoke="fc-sitting-bar">
                <b>🎯 Bid {sitting.at + 1} of {sitting.omos.length}{sentNow ? " · sent ✓" : ""}</b>
                {sentNow
                  ? <button type="button" className="is-next" data-hpd-smoke="fc-sitting-next" onClick={() => nextInSitting(false)}>{last ? "Finish ✓" : "Next bid ▶"}</button>
                  : <button type="button" data-hpd-smoke="fc-sitting-skip" onClick={() => nextInSitting(true)}>{last ? "Skip & finish" : "Skip ▶"}</button>}
                <button type="button" className="is-stop" data-hpd-smoke="fc-sitting-stop" onClick={() => { setSitting(null); setChecklistOpen(true); }}>Stop</button>
              </div>
            );
          })() : null}
          <div className="fc-bid-body">
            <h3>{selected.address}{selected.borough ? ` · ${selected.borough}` : ""}</h3>
            {/* The building, like the awarded job card: your photo or Google Street View, 360° and camera. */}
            <BuildingHero key={selected.omo} id={`BID-${selected.omo}`} address={selected.address} borough={selected.borough || ""} point={Number.isFinite(selected.lat) && Number.isFinite(selected.lng) ? { lat: selected.lat as number, lng: selected.lng as number } : null} />
            <nav className="fc-bid-jump" aria-label="Jump to" data-hpd-smoke="fc-bid-jump">
              {([["fc-sec-job", "📋 Job"], ["fc-sec-price", "💰 Price"], ["fc-sec-building", "🏢 Building"], ["fc-sec-send", "📠 Send"]] as const).map(([id, label]) => (
                <button key={id} type="button" onClick={() => document.getElementById(id)?.scrollIntoView({ block: "start" })}>{label}</button>
              ))}
              <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${selected.address}, ${selected.borough || ""} NY`)}`} target="_blank" rel="noopener noreferrer" data-hpd-smoke="fc-bid-maplink">📍 Map</a>
            </nav>
            <p className={`fc-bid-due is-${dueWhen(selected).tone}`} data-hpd-smoke="fc-bid-due">⏰ Bid due {dueLabel(selected)} · {dueWhen(selected).text}</p>
            {(() => {
              const nb = noBidOf(selected);
              const sentAlready = !!record && record.status !== "saved";
              if (nb) return (
                <div className="fc-nobid is-set" data-hpd-smoke="fc-nobid-set">
                  <b>🚫 No bid{nb.reason ? `: ${nb.reason}` : ""}</b>
                  <small>Marked {when(nb.at)}. The checklist won&apos;t ask for it.</small>
                  <button type="button" data-hpd-smoke="fc-nobid-undo" onClick={() => void markNoBid(null)}>Undo</button>
                </div>
              );
              if (sentAlready) return null;
              return noBidAsk ? (
                <div className="fc-nobid" data-hpd-smoke="fc-nobid-ask">
                  <b>🚫 Not bidding this one? Why:</b>
                  <div className="fc-nobid-reasons">{NO_BID_REASONS.map((r) => <button key={r} type="button" data-hpd-smoke="fc-nobid-reason" onClick={() => void markNoBid(r)}>{r}</button>)}</div>
                  <button type="button" className="fc-nobid-cancel" onClick={() => setNoBidAsk(false)}>Cancel</button>
                </div>
              ) : <button type="button" className="fc-nobid-open" data-hpd-smoke="fc-nobid" onClick={() => setNoBidAsk(true)}>🚫 No bid</button>;
            })()}
            <div className="fc-job-sum" id="fc-sec-job" data-hpd-smoke="fc-job-sum">
              <b>📋 The job</b>
              <ul>{summary.lines.length ? summary.lines.map((l) => <li key={l.key} className={`is-${l.key}`}>{lineText(l)}</li>) : <li>General repair (see HPD&apos;s text below)</li>}</ul>
              {summary.where.length || summary.rooms.length ? <p data-hpd-smoke="fc-job-where">📍 {[...summary.where, ...summary.rooms].join(" · ")}{summary.rooms.length > 1 ? ` (${summary.rooms.length} areas)` : ""}</p> : null}
            </div>
            {(() => {
              const row = checklist.rows.find((r) => r.omo === selected.omo);
              const u = row ? urgency(row.minutesLeft, row.state === "pending" || row.state === "confirmed") : "";
              return (
                <>
                  {earlyDeadline(selected.bidDueTime) && row && row.state !== "pending" && row.state !== "confirmed" ? <p className="fc-bid-early" data-hpd-smoke="fc-bid-early">⏰ Early deadline ({selected.bidDueTime}): HPD usually closes bids at 11:00 AM; this one closes sooner.</p> : null}
                  {u ? <p className={`fc-bid-urgent${u === "too-late" ? " is-late" : ""}`} data-hpd-smoke="fc-bid-urgent">{u === "too-late" ? "⛔ It may arrive too late: send it now and call HPD to say it's coming." : "⚠️ Send now: a fax can take up to 25 min and HPD's line is busy before the deadline."}</p> : null}
                </>
              );
            })()}
            <BidTimeline record={record} />
            <p className="fc-bid-dates">Work {selected.workStart ? `starts ${selected.workStart.slice(5).replace("-", "/")}` : "start not listed"}{selected.workCompletion ? ` · done by ${selected.workCompletion.slice(5).replace("-", "/")}` : ""}</p>
            {record && state !== "saved" ? (
              <div className={`fc-bid-status is-${state}`} data-hpd-smoke="fc-bid-status">
                <b>{FAX_TEXT[state]}</b>
                <span>Sent {when(record.sentAt)} at {money2(record.sentPrice || record.price)} to HPD fax (212) 863-8655{record.attempts > 1 ? ` · ${record.attempts} sends` : ""}</span>
                {record.confirmedAt ? <span>HumbleFax {state === "failed" ? "reported" : "confirmed"} {when(record.confirmedAt)}{record.faxNote ? `: "${record.faxNote}"` : ""}</span> : null}
                {note ? <small>{note}</small> : null}
                {(state === "waiting" || state === "unconfirmed") && faxCheckNote ? (
                  <small className="fc-bid-warn" data-hpd-smoke="fc-fax-check-note">{faxCheckNote === "read"
                    ? <>The app can&apos;t read HumbleFax&apos;s emails yet, so it can&apos;t confirm by itself. On the <a href="/storage/">Storage page</a> tap Disconnect, then Connect, and allow reading email. Or tap the button below once HumbleFax emails you.</>
                    : `Couldn't check HumbleFax's email: ${faxCheckNote}`}</small>
                ) : null}
                {state === "waiting" || state === "unconfirmed" ? (
                  <button type="button" className="fc-bid-confirm" data-hpd-smoke="fc-bid-mark-confirmed" onClick={() => void markConfirmed()}>{armed === "confirmed" ? "✅ Tap again: mark delivered" : "✓ I got HumbleFax\u2019s confirmation email"}</button>
                ) : null}
              </div>
            ) : null}
            <section>
              {selected.itbFile ? <ItbPages pdfUrl={itbPdfUrl(selected.itbFile)} pageCount={selected.pages || 3} descPages={selected.descPages} /> : null}
              <div className="fc-bid-desc-head">
                <button type="button" className="fc-bid-text-toggle" data-hpd-smoke="fc-bid-text-toggle" aria-expanded={showText} onClick={() => setShowText((v) => !v)}>{showText ? "▾ HPD's text" : "▸ Show HPD's text"}</button>
                <button type="button" data-hpd-smoke="fc-bid-text-size" aria-label={bigText ? "Smaller text" : "Bigger text"} aria-pressed={bigText} onClick={() => setBigText((v) => { try { localStorage.setItem("hpd-bid-text", v ? "l" : "xl"); } catch {} return !v; })}>{bigText ? "A−" : "A+"}</button>
              </div>
              <p hidden={!showText} className={`fc-bid-description${bigText ? " is-xl" : ""}`} data-hpd-smoke="fc-bid-description">{selected.description ? readableDescription(selected.description) : "No description on the invitation."}</p>
              {selected.notes ? (
                <>
                  <h4>HPD notes &amp; contacts</h4>
                  <p className={`fc-bid-notes${bigText ? " is-xl" : ""}`} data-hpd-smoke="fc-bid-notes">{selected.notes}</p>
                </>
              ) : null}
              <a className="fc-bid-link" data-hpd-smoke="fc-bid-view" href={itbPdfUrl(selected.itbFile)} target="_blank" rel="noreferrer">📄 View the invitation ({selected.pages} pages)</a>
            </section>
            <section id="fc-sec-price" className={`fc-bid-price fc-bid-step${step1Done ? " is-done" : ""}`} data-hpd-smoke="fc-step-1">
              <h4>{step1Done ? "✓" : "1"} · Your bid price{step1Done ? ` · saved ${money2(record!.price)}` : ""}</h4>
              {rounds.length ? (
                <div className="fc-bid-again" data-hpd-smoke="fc-bid-again">
                  <b>🔁 Invited again: you bid this job before</b>
                  {rounds.map((r, i) => <span key={i}>Due {r.bidDue.slice(5).replace("-", "/")}: {money2(r.price)}{r.sentAt && r.status !== "saved" ? ` · sent ${when(r.sentAt)}` : " · not sent"}</span>)}
                  {draftValue > 0 && draftValue < rounds[0].price ? <span className="fc-bid-again-warn" data-hpd-smoke="fc-bid-lower-warn">⚠️ {money2(draftValue)} is lower than your last bid of {money2(rounds[0].price)}.</span> : null}
                </div>
              ) : null}
              {easy ? (
                <div className="fc-bid-easy" data-hpd-smoke="fc-bid-easy">
                  <b>Easy win: bid this one · ~{money(easy.suggested)}</b>
                  <span>{easy.label}: you usually win it at {money(easy.yours)} ({easy.yoursN} of your wins). Other contractors won it at {money(easy.others)} ({easy.othersN} jobs, last 12 months). At {money(easy.suggested)} you would have beaten {easy.beatsN} of those {easy.of} winners.</span>
                  <button type="button" onClick={() => pickPrice(String(easy.suggested))}>Use {money(easy.suggested)}</button>
                </div>
              ) : null}
              <label>
                <span>$</span>
                <input inputMode="decimal" aria-label="Bid price" data-hpd-smoke="fc-bid-price" placeholder="0.00" value={draft} disabled={sentLocked} onChange={(e) => setDraft(e.target.value)} />
              </label>
              {!sentLocked && help && help.prices.length >= 5 ? (() => {
                const best = bestWithFloor(help, selFloor);
                const mineOk = calc.complete && calc.total > 0;
                return (
                  <div className="fc-bid-reco" data-hpd-smoke="fc-bid-reco">
                    <span>💡 Recommended <b>{money(best.price)}</b> · wins about {Math.round(best.chance * 100)}%{best.floored ? " (your minimum)" : ""}</span>
                    <button type="button" data-hpd-smoke="fc-bid-reco-use" onClick={() => pickPrice(String(best.price))}>Use</button>
                    {mineOk ? <><span className="fc-bid-reco-mine">🧮 My price <b>{money(calc.total)}</b> · wins about {Math.round(winChance(help, calc.total) * 100)}%</span><button type="button" data-hpd-smoke="fc-bid-reco-mine" onClick={() => pickPrice(String(calc.total))}>Use</button></> : null}
                    <small>You choose: tap Use or type your own price.</small>
                  </div>
                );
              })() : null}
              {draftDoc?.omo === selected.omo && !record ? <p className="fc-bid-prefilled" data-hpd-smoke="fc-bid-prefilled">📄 The bid form is filled in: company, owner, address, phone, dates and the job description. Only your price is missing: type it and tap Save, and the bid document is made right away. <a href={draftDoc.url} target="_blank" rel="noreferrer" data-hpd-smoke="fc-bid-draft-doc">Open the filled form</a></p> : null}
              {highPrice ? (
                <div className="fc-bid-high" data-hpd-smoke="fc-bid-high" role="alert">
                  <b>⚠️ {money(draftValue)} will probably lose</b>
                  <span>It would have won only about {highPrice.chance}% of jobs like this ({highPrice.n} recent awards). The best price is {money(highPrice.best)} (wins ~{highPrice.bestChance}%).</span>
                  <button type="button" onClick={() => pickPrice(String(highPrice.best))}>Use {money(highPrice.best)}</button>
                </div>
              ) : selFloor && draftNumber > 0 && draftNumber < selFloor ? (
                <div className="fc-bid-high is-soft" data-hpd-smoke="fc-bid-below-floor" role="note">
                  <b>Below your minimum for {selKind}</b>
                  <span>You set {money(selFloor)} as the least you&apos;ll take for this kind of work.</span>
                  <button type="button" onClick={() => pickPrice(String(selFloor))}>Use {money(selFloor)}</button>
                </div>
              ) : abovePrice ? (
                <div className="fc-bid-high is-soft" data-hpd-smoke="fc-bid-above" role="note">
                  <b>{abovePrice.pct}% above the best price</b>
                  <span>Wins about {abovePrice.chance}% of jobs like this; {money(abovePrice.best)} wins about {abovePrice.bestChance}%.</span>
                  <button type="button" onClick={() => pickPrice(String(abovePrice.best))}>Use {money(abovePrice.best)}</button>
                </div>
              ) : null}
              <input className="fc-bid-reason" disabled={sentLocked} aria-label="Why this price" data-hpd-smoke="fc-bid-reason" placeholder="Why this price? (optional, remembered for jobs like this)" value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} />
              {mineForThis.length ? (
                <div className="fc-bid-mine" data-hpd-smoke="fc-bid-mine">
                  <b>Your price for this work: {money(mineForThis[0].price)}</b>
                  <span>{mineForThis[0].omo} · {mineForThis[0].date ? `${mineForThis[0].date.slice(5, 7)}/${mineForThis[0].date.slice(8, 10)}` : ""} · {mineForThis[0].sent ? "sent to HPD" : "saved"}{mineForThis.length > 1 ? ` · ${mineForThis.length} of your bids on this kind of work: ${mineForThis.slice(0, 4).map((p) => money(p.price)).join(", ")}` : ""}</span>
                  {mineForThis[0].reason ? <span className="fc-bid-mine-reason">“{mineForThis[0].reason}”</span> : null}
                  {draftValue !== mineForThis[0].price ? <button type="button" onClick={() => pickPrice(String(mineForThis[0].price))}>Use {money(mineForThis[0].price)}</button> : <small>Started from your price. The market numbers are below for comparison.</small>}
                </div>
              ) : null}
              <div className="fc-my-price" data-hpd-smoke="fc-my-price">
                <b>🧮 Price calculator (your rates)</b>
                {calc.lines.map((l) => {
                  const k = l.key;
                  const editing = rateEdit[k] !== undefined;
                  const unitText = l.unit;
                  return (
                    <div key={k} className={`fc-my-row${l.extra ? " is-extra" : ""}${l.overridden ? " is-changed" : ""}`} data-hpd-smoke="fc-my-row" data-key={k}>
                      <span>{l.extra ? l.label : lineText(summary.lines.find((x) => x.key === k) || { key: k, label: l.label, qty: l.qty, unit: "job", detail: "" })}</span>
                      {editing ? (
                        <span className="fc-my-edit">
                          <label>$<input inputMode="decimal" aria-label={`Your rate ${unitText} for ${l.label}`} data-hpd-smoke="fc-rate-input" value={rateEdit[k]} onChange={(e) => setRateEdit((x) => ({ ...x, [k]: e.target.value }))} /></label>
                          <small>{unitText}</small>
                          <button type="button" data-hpd-smoke="fc-rate-save" onClick={() => { setRates(saveRate(k, Number(rateEdit[k].replace(/[^0-9.]/g, "")) || null)); setRateEdit((x) => { const n = { ...x }; delete n[k]; return n; }); }}>Save</button>
                        </span>
                      ) : overrideEdit?.key === k ? (
                        <span className="fc-my-edit">
                          <label>$<input inputMode="decimal" aria-label={`This job only: ${l.label}`} data-hpd-smoke="fc-calc-override-input" value={overrideEdit.value} onChange={(e) => setOverrideEdit({ key: k, value: e.target.value })} /></label>
                          <small>this job only</small>
                          <button type="button" data-hpd-smoke="fc-calc-override-save" onClick={() => { const v = Number(overrideEdit.value.replace(/[^0-9.]/g, "")); setCalcOverride((x) => { const n = { ...x }; if (v > 0) n[k] = Math.round(v); else delete n[k]; return n; }); setOverrideEdit(null); }}>OK</button>
                        </span>
                      ) : (
                        <span className="fc-calc-cell">
                          <button type="button" className="fc-my-rate" data-hpd-smoke="fc-rate-edit" onClick={() => setRateEdit((x) => ({ ...x, [k]: l.rate ? String(l.rate) : "" }))}>
                            {l.rate ? <>{money2(l.rate).replace(".00", "")} {unitText}{l.amount !== null && !l.overridden ? <b> = {money(l.amount)}</b> : !l.overridden ? <em> · {l.why}</em> : null}</> : <>Set my rate {unitText}</>}
                          </button>
                          {l.amount !== null || l.rate ? <button type="button" className="fc-calc-amount" data-hpd-smoke="fc-calc-override" aria-label={`Change ${l.label} for this job`} onClick={() => setOverrideEdit({ key: k, value: l.amount ? String(l.amount) : "" })}>{l.overridden ? <><b>{money(l.amount || 0)}</b> ✎ this job</> : "✎"}</button> : null}
                        </span>
                      )}
                    </div>
                  );
                })}
                {calc.subtotal > 0 ? (
                  <>
                    <div className="fc-calc-adjust" data-hpd-smoke="fc-calc-adjust">
                      <span>Does it sound right? Move the total:</span>
                      {[-10, -5, 5, 10].map((p) => <button key={p} type="button" className={calcAdjust === p ? "is-on" : ""} data-hpd-smoke={`fc-calc-adjust-${p}`} onClick={() => setCalcAdjust((a) => (a === p ? 0 : p))}>{p > 0 ? `+${p}` : p}%</button>)}
                    </div>
                    <div className="fc-my-total" data-hpd-smoke="fc-my-total">
                      <span>{myCalc.complete ? "My price" : `My price so far (${myCalc.missing} line${myCalc.missing === 1 ? "" : "s"} without a rate)`}: <b>{money(myCalc.total)}</b>{calcAdjust ? <small> ({money(calc.subtotal)} {calcAdjust > 0 ? "+" : ""}{calcAdjust}%)</small> : null}{help && help.prices.length >= 5 ? <small> · wins about {Math.round(winChance(help, myCalc.total) * 100)}% of jobs like this</small> : null}</span>
                      <button type="button" data-hpd-smoke="fc-my-use" onClick={() => pickPrice(String(myCalc.total))}>Use {money(myCalc.total)}</button>
                    </div>
                    {help && help.prices.length >= 5 ? (() => {
                      const best = bestWithFloor(help, selFloor);
                      const diff = Math.round((myCalc.total / best.price - 1) * 100);
                      return <p className="fc-calc-verdict" data-hpd-smoke="fc-calc-verdict">{Math.abs(diff) <= 5 ? "✓ About the market's best price" : diff > 0 ? `↑ ${diff}% above the market's best price` : `↓ ${-diff}% under the market's best price`} ({money(best.price)}, wins ~{Math.round(best.chance * 100)}%).{diff > 15 ? " Raise only if this job is harder than it looks (floors, access, parts)." : diff < -15 ? " You may be leaving money on the table." : ""}</p>;
                    })() : null}
                    {(() => {
                      const cost = jobCost(calc.lines, costs);
                      if (!cost.total) return <p className="fc-calc-cost is-empty" data-hpd-smoke="fc-calc-cost">💵 Add your costs (Bids → Stats → Your costs) to see your profit on this job.</p>;
                      const mine = profitAt(myCalc.total, cost.total);
                      const best = help && help.prices.length >= 5 ? bestWithFloor(help, selFloor) : null;
                      const atBest = best ? profitAt(best.price, cost.total) : null;
                      const names = cost.missing.map((k) => COST_ITEMS.find((c) => c.key === k)?.label || k);
                      return (
                        <div className="fc-calc-cost" data-hpd-smoke="fc-calc-cost">
                          <b>💵 Your cost {money(cost.total)}</b> <small>(materials {money(cost.material)}{cost.labor ? ` + labor ${money(cost.labor)}` : ""}{cost.trip ? ` + trip ${money(cost.trip)}` : ""})</small>
                          <span className={mine.profit < 0 ? "is-loss" : ""} data-hpd-smoke="fc-calc-profit">Profit at your price {money(myCalc.total)}: <b>{money(mine.profit)} ({mine.pct}%)</b></span>
                          {atBest && best ? <span className={atBest.profit < 0 ? "is-loss" : ""} data-hpd-smoke="fc-calc-profit-best">At the best price {money(best.price)}: {money(atBest.profit)} ({atBest.pct}%)</span> : null}
                          {names.length ? <small className="fc-calc-cost-missing" data-hpd-smoke="fc-calc-cost-missing">No cost set yet for: {names.join(", ")} (the profit doesn&apos;t count them).</small> : null}
                        </div>
                      );
                    })()}
                  </>
                ) : <small className="fc-my-hint">Tap a line to set what you charge (per sq ft, per door, each part, per floor up, per extra location). Saved on this phone for every job like it; ✎ changes a line for this job only.</small>}
              </div>
              {help ? (
                <div className={`fc-bid-help is-${help.confidence}`} data-hpd-smoke="fc-bid-help">
                  <em data-hpd-smoke="fc-bid-confidence">{help.confidence === "good" ? "Good match" : help.confidence === "fair" ? "Fair match" : "Rough guide: check it"}</em>
                  <b>Winning prices on this kind of work: {money(help.low)}–{money(help.high)} · middle {money(help.middle)}</b>
                  <small data-hpd-smoke="fc-bid-why">{help.why}{help.yours ? ` · ${help.yours} of these ${help.yours === 1 ? "was" : "were"} yours` : ""}.</small>
                  {help.trend ? <small className={`fc-bid-trend ${help.trend.change > 0 ? "is-up" : help.trend.change < 0 ? "is-down" : ""}`} data-hpd-smoke="fc-bid-trend">Last 90 days: middle {money(help.trend.recent)}, {help.trend.change === 0 ? "same as" : `${help.trend.change > 0 ? "up" : "down"} ${Math.abs(help.trend.change)}% from`} {money(help.trend.before)} before.</small> : null}
                  {help.unmatched.length ? <p className="fc-bid-warn" data-hpd-smoke="fc-bid-unmatched">No awarded job with: {help.unmatched.join(", ")}. Add your own price for that part.</p> : null}
                  {(() => {
                    const best = bestWithFloor(help, selFloor);
                    const move = stats?.allMoves.find((g) => g.name === `${tradeOf(selected.description)} · ${selected.borough === "MN" ? "Manhattan" : selected.borough === "BK" ? "Brooklyn" : selected.borough === "QN" ? "Queens" : selected.borough === "BX" ? "Bronx" : selected.borough === "SI" ? "Staten Island" : selected.borough}`);
                    const mineForWork = sentStats?.byWork.find((g) => g.work === scope.labels[0]);
                    return (
                      <div className="fc-bid-best" data-hpd-smoke="fc-bid-best">
                        <span>💰 Best price</span>
                        <b>{money(best.price)}</b>
                        {best.floored
                          ? <small data-hpd-smoke="fc-bid-floored">Your minimum for {selKind} ({money(best.price)}) is above the app&apos;s best price ({money(best.appBest)}): at {money(best.price)} it wins about {Math.round(best.chance * 100)}% of jobs like this.</small>
                          : <small>Wins about {Math.round(best.chance * 100)}% of jobs like this: the most money over time (price × chance of winning). Tested on past awards since April: more money than the middle or the safest price.</small>}
                        <button type="button" data-hpd-smoke="fc-bid-use-best" onClick={() => pickPrice(String(best.price))}>Use {money(best.price)}</button>
                        <div className="fc-floor" data-hpd-smoke="fc-floor">
                          <span>{selFloor ? <>Your minimum for {selKind}: <b>{money(selFloor)}</b></> : <>No minimum set for {selKind}</>}</span>
                          {floorEdit === null ? <button type="button" data-hpd-smoke="fc-floor-edit" onClick={() => setFloorEdit(selFloor ? String(selFloor) : "")}>{selFloor ? "Change" : "Set my minimum"}</button> : null}
                          {floorEdit !== null ? (
                            <span className="fc-floor-form">
                              <label>$<input inputMode="decimal" aria-label={`Your minimum for ${selKind}`} data-hpd-smoke="fc-floor-input" placeholder="e.g. 450" value={floorEdit} onChange={(e) => setFloorEdit(e.target.value)} /></label>
                              <button type="button" data-hpd-smoke="fc-floor-save" onClick={() => { setFloors(saveFloor(selKind, Number(floorEdit.replace(/[^0-9.]/g, "")) || null)); setFloorEdit(null); }}>Save</button>
                              {selFloor ? <button type="button" data-hpd-smoke="fc-floor-remove" onClick={() => { setFloors(saveFloor(selKind, null)); setFloorEdit(null); }}>Remove</button> : null}
                              <button type="button" onClick={() => setFloorEdit(null)}>Cancel</button>
                            </span>
                          ) : null}
                          <small>The least you&apos;ll take for this kind of work (kept on this phone). The best price never goes below it.</small>
                        </div>
                        {move ? <p className={`fc-bid-move is-${move.advice}`} data-hpd-smoke="fc-bid-move">{move.advice === "raise" ? "📈 Raise your price" : "📉 Others win cheaper"} on {move.name}: you win {Math.round(move.winRate * 100)}% · you usually get {money(move.yourPrice)}, others win at {money(move.othersPrice)}.</p> : null}
                        {mineForWork && mineForWork.bids >= 5 ? <p className="fc-bid-move" data-hpd-smoke="fc-bid-mine-work">Your bids on {mineForWork.work}: won {mineForWork.won} of {mineForWork.bids} ({mineForWork.winRate}%){mineForWork.lostAboveBy ? ` · when you lost, you were ~${money(mineForWork.lostAboveBy)} above the winner` : ""}.</p> : null}
                      </div>
                    );
                  })()}
                  <div className="fc-bid-targets" data-hpd-smoke="fc-bid-targets">
                    {[
                      { label: "Win most", price: help.toWin },
                      { label: "Middle", price: help.middle },
                      { label: "High", price: help.high },
                    ].map((t) => (
                      <button type="button" key={t.label} onClick={() => pickPrice(String(t.price))}>
                        <small>{t.label}</small><b>{money(t.price)}</b><small>wins ~{Math.round(winChance(help, t.price) * 100)}%</small>
                      </button>
                    ))}
                  </div>
                  {draftValue > 0 ? <p className="fc-bid-chance" data-hpd-smoke="fc-bid-chance">At {money(draftValue)} you would have won about <b>{Math.round(winChance(help, draftValue) * 100)}%</b> of these jobs.</p> : null}
                  <button type="button" className="fc-bid-link" data-hpd-smoke="fc-bid-similar-toggle" onClick={() => setShowSimilar((v) => !v)}>{showSimilar ? "Hide past jobs" : `Past jobs like this (${help.similar.length})`}</button>
                  {showSimilar ? (
                    <ol className="fc-bid-similar" data-hpd-smoke="fc-bid-similar">{help.similar.map((e) => (
                      <li key={e.id}>
                        <button type="button" onClick={() => setDraft(String(e.amount))}><b>{money(e.amount)}</b></button>
                        <span><b>{e.id}</b>{e.date ? ` · ${e.date.slice(5, 7)}/${e.date.slice(8, 10)}/${e.date.slice(2, 4)}` : ""} · <em className={e.won ? "is-yours" : ""}>{e.won ? "you won" : "other contractor"}</em></span>
                        <small>{e.summary}{e.address ? ` · ${e.address}` : ""}</small>
                      </li>
                    ))}</ol>
                  ) : null}
                </div>
              ) : <p className="fc-bid-help is-none">No similar past awards to compare with: price this one from the description.</p>}
              {sentLocked ? (
                <div className="fc-bid-locked" data-hpd-smoke="fc-bid-locked">
                  <b>🔒 Sent to HPD at {money2(record!.sentPrice || record!.price)} · {when(record!.sentAt)}</b>
                  <span>HPD has this price. To change it, send a revised bid: the old price is crossed out and HPD is told to disregard it.</span>
                  <button type="button" data-hpd-smoke="fc-bid-revise" onClick={() => void startRevision()}>{armed === "revise" ? "✅ Tap again: revise (HPD is told to disregard the old price)" : "✏️ Revise this bid"}</button>
                </div>
              ) : (
              <button type="button" className={`fc-bid-fill${step1Done && (reason.trim() || undefined) === record?.reason ? " is-done" : ""}`} data-hpd-smoke="fc-bid-save" disabled={!(draftValue > 0) || (draftValue === record?.price && (reason.trim() || undefined) === record?.reason)} onClick={() => {
                if (highPrice && draftValue !== record?.price && armed !== "high") { setArmed("high"); return; } // second tap saves a high price
                void savePrice();
              }}>
                {armed === "high" && highPrice && draftValue !== record?.price ? `Tap again to save ${money2(draftValue)} anyway` :
                record && draftValue === record.price && (reason.trim() || undefined) !== record.reason ? "Save reason" : record && draftValue !== record.price && draftValue > 0 ? `Save new price ${money2(draftValue)}` : step1Done ? `✓ Price saved · ${money2(record!.price)}` : `Save price${draftValue > 0 ? ` ${money2(draftValue)}` : ""}`}
              </button>
              )}
              {revising && record && !revisedFrom(record) ? (
                <div className="fc-bid-locked is-revising" data-hpd-smoke="fc-bid-revising">
                  <b>✏️ Revising · HPD has {money2(record.sentPrice || record.price)}</b>
                  <span>Type the new price and save it, then fill and send the revised package.</span>
                  <button type="button" className="is-plain" data-hpd-smoke="fc-bid-revise-cancel" onClick={() => void cancelRevision()}>Cancel revision</button>
                </div>
              ) : null}
              {savedFlash && record ? <p className="fc-bid-saved-flash" role="status" data-hpd-smoke="fc-bid-saved-flash">✅ Price saved: {money2(record.price)}. Next: fill the package (step 2).</p> : null}
              {record ? <p className="fc-bid-saved" data-hpd-smoke="fc-bid-saved">✓ Price saved: <b>{money2(record.price)}</b> · {when(record.savedAt)}{revisedFrom(record) ? <> · HPD has <s>{money2(revisedFrom(record)!)}</s>: fill and send the <b>revised</b> bid</> : ""}</p> : null}
              {record && record.status === "saved" ? <button type="button" className="fc-bid-link" data-hpd-smoke="fc-bid-sent-elsewhere" onClick={() => void markSentElsewhere()}>{armed === "self" ? `✅ Tap again: record that you sent it at ${money2(record.price)}` : "I sent this bid myself (Gmail / fax)"}</button> : null}
            </section>
            <section id="fc-sec-building" className="fc-bid-building" data-hpd-smoke="fc-bid-building">
              <h4>🏢 The building</h4>
              <BuildingFacts address={selected.address} borough={selected.borough} description={selected.description} />
              {sameBuilding.length ? (
                <div className="fc-bid-again is-building" data-hpd-smoke="fc-bid-same-building">
                  <b>🏢 Same building: you bid here recently</b>
                  {sameBuilding.map((r) => <span key={r.omo}>{r.omo}: {money2(r.sentPrice || r.price)}{r.sentAt ? ` · sent ${when(r.sentAt)}` : ""}</span>)}
                </div>
              ) : null}
              {buildingJobs.length ? (
                <div className="fc-bid-building-history" data-hpd-smoke="fc-bid-building-history">
                  <b>🏢 Earlier jobs at this building ({buildingJobs.length})</b>
                  <ul>
                    {buildingJobs.slice(0, 5).map((j) => (
                      <li key={j.omo} className={j.sameWork ? "is-same" : ""}>
                        <span className="fc-bbh-price">{money(j.paid)}</span>
                        <span className="fc-bbh-what">
                          {j.won ? <em className="is-won">you won</em> : <em>other contractor won</em>}
                          {j.yours ? <> · you bid {money(j.yours)}</> : null}
                          {" · "}{j.awardDate.slice(5, 7)}/{j.awardDate.slice(2, 4)}
                          <small>{j.sameWork ? "same kind of work · " : ""}{j.work} · {j.omo}</small>
                        </span>
                      </li>
                    ))}
                  </ul>
                  {buildingJobs.some((j) => j.sameWork) ? <small>Same kind of work is listed first. The winning price is what HPD paid.</small> : <small>Different work from this bid: compare with care. The winning price is what HPD paid.</small>}
                </div>
              ) : null}
            </section>
            <span id="fc-sec-send" />
            {record ? (
              <section className={`fc-bid-price fc-bid-step${reviewedSaved ? " is-done" : ""}`} data-hpd-smoke="fc-step-2">
                <h4>{reviewedSaved ? "✓" : "2"} · Review the package{reviewedSaved ? ` · filled at ${money2(reviewedSaved.price)}` : ""}</h4>
                <button type="button" className={`fc-bid-fill is-secondary${reviewedSaved ? " is-done" : ""}`} data-hpd-smoke="fc-bid-review" disabled={busy === "Filling the bid package…" || faxLocked} onClick={() => void review()}>
                  {busy === "Filling the bid package…" ? "⏳ Filling the package…" : faxLocked ? `🔒 Package sent at ${money2(record.sentPrice || record.price)}` : reviewedSaved ? `✓ Package filled · ${money2(reviewedSaved.price)} · tap to refill` : revisedFrom(record) ? `Fill the revised package: ${money2(revisedFrom(record)!)} → ${money2(record.price)}` : `Fill the package at ${money2(record.price)}`}
                </button>
                <small className="fc-bid-note">Price on page 1, page 2 and the Work Description Form, plus your company details, signatures, date and the work description.</small>
                {reviewedSaved ? (
                  <div className="fc-bid-done" data-hpd-smoke="fc-bid-done">
                    <b>✓ Package ready · {money2(reviewedSaved.price)}</b>
                    <a href={reviewedSaved.url} target="_blank" rel="noreferrer" data-hpd-smoke="fc-bid-open">Open to review</a>
                    <a href={reviewedSaved.url} download={reviewedSaved.name}>Save</a>
                    <button type="button" data-hpd-smoke="fc-bid-share" onClick={() => void share()}>Share</button>
                    {shareNote ? <small className="fc-bid-note" data-hpd-smoke="fc-bid-share-note">{shareNote}</small> : null}
                  </div>
                ) : null}
                <h4 className={step3Done ? `is-done is-${state}` : ""} data-hpd-smoke="fc-step-3">{step3Done ? (state === "confirmed" ? "✓" : state === "failed" ? "✗" : "⏳") : "3"} · Send to HPD{step3Done ? (state === "confirmed" ? ` · fax confirmed ${money2(record.sentPrice || record.price)}` : state === "failed" ? " · fax failed" : ` · fax going through ${money2(record.sentPrice || record.price)}`) : ""}</h4>
                <button type="button" className={`fc-bid-fill is-send${step3Done && state === "confirmed" ? " is-done" : ""}`} data-hpd-smoke="fc-bid-send" disabled={faxLocked || !reviewedSaved || busy === "Sending the fax…"} onClick={() => void send("main")}>
                  {busy === "Sending the fax…" ? "⏳ Sending the fax…" : armed === "send" ? `✅ Tap again to send ${revisedFrom(record) ? "the REVISED bid" : "the bid"} at ${money2(record.price)} to HPD` : revisedFrom(record) ? "📠 Send revised bid to HPD" : state === "saved" ? "📠 Send bid by fax to HPD" : state === "failed" || state === "unconfirmed" ? "📠 Resend bid by fax" : state === "confirmed" ? "✓ Fax confirmed by HumbleFax · locked" : "⏳ Fax going through · send again"}
                </button>
                {armed === "send" ? <button type="button" className="fc-bid-link" data-hpd-smoke="fc-bid-send-cancel" onClick={() => setArmed("")}>Cancel, don&apos;t send</button> : null}
                {reviewedSaved && (state === "failed" || state === "unconfirmed" || busy.startsWith("Not sent")) ? (
                  <div className="fc-bid-backup" data-hpd-smoke="fc-bid-backup">
                    <small>Didn&apos;t go through? Send to HPD&apos;s backup fax (HumbleFax):</small>
                    {FAX_LINES.filter((l) => l.id !== "main").map((l) => (
                      <button key={l.id} type="button" className="fc-bid-fill is-secondary" data-hpd-smoke={`fc-bid-send-${l.id}`} disabled={busy === "Sending the fax…"} onClick={() => void send(l.id)}>
                        {armed === `send-${l.id}` ? `✅ Tap again to send to ${l.label}` : `📠 Send to backup ${l.label}`}
                      </button>
                    ))}
                  </div>
                ) : null}
                {busy.startsWith("Not sent") ? <p className="fc-bid-send-error" role="alert" data-hpd-smoke="fc-bid-send-error">❌ {busy}</p> : null}
                {busy.startsWith("Not sent") && /sign in|reconnect|google/i.test(busy) ? <ReconnectGoogle text="Reconnect Google, then tap Send again (you come straight back here)." /> : null}
                <small className="fc-bid-note">{reviewedSaved ? (armed === "send" ? (revisedFrom(record) ? `Old price ${money2(revisedFrom(record)!)} crossed out, new price ${money2(record.price)}; the cover asks HPD to disregard the old price.` : "This submits your bid to HPD's bid fax (212) 863-8655 through HumbleFax, with a cover sheet.") : "Goes to HPD's bid fax (212) 863-8655 through HumbleFax, with a cover sheet. Tap twice to send.") : "Fill and review the package first."}</small>
              </section>
            ) : null}
            {busy ? <p role="status" className="fc-bid-busy">{busy}</p> : null}
            {record ? (
              <section className="fc-bid-log" data-hpd-smoke="fc-bid-log">
                <h4>Bid history</h4>
                <ol>{bidHistory(record).map((e, i) => (
                  <li key={`${e.at}-${i}`}><time>{when(e.at)}</time><span>{e.what}</span></li>
                ))}</ol>
              </section>
            ) : null}
          </div>
        </div>
      ) : (
        <>
        {pagesFor?.itbFile ? (
          <div className="fc-bid-pages-sheet" role="dialog" aria-label={`HPD's pages for ${pagesFor.omo}`} data-hpd-smoke="fc-bid-pages-sheet">
            <header>
              <button type="button" data-hpd-smoke="fc-bid-pages-close" onClick={() => setPagesFor(null)}>← Bids</button>
              <strong>{pagesFor.omo} · {pagesFor.address}</strong>
              <button type="button" className="is-go" data-hpd-smoke="fc-bid-pages-open" onClick={() => { const b = pagesFor; setPagesFor(null); openBid(b); }}>Price it →</button>
            </header>
            <div className="fc-bid-pages-body">
              <ItbPages pdfUrl={itbPdfUrl(pagesFor.itbFile)} pageCount={pagesFor.pages || 3} descPages={pagesFor.descPages} />
            </div>
          </div>
        ) : null}
        <aside className={`fc-bids-list is-${listSize}${listCollapsed ? " is-collapsed" : ""}`} data-size={listSize} style={listRoom && !listCollapsed ? { height: `${Math.round(listSize === "full" ? listRoom : Math.max(Math.min(200, listRoom * 0.6), listRoom * 0.5))}px`, maxHeight: `${Math.round(listRoom)}px` } : undefined} aria-label="Invitations to bid" data-hpd-smoke="fc-bids-list">
          <button type="button" className="fc-bids-handle" data-hpd-smoke="fc-bids-collapse" aria-label={listSize === "full" ? "Make the list smaller" : "Show more of the list"}
            onClick={() => setListSize((v) => (v === "peek" ? "half" : v === "half" ? "full" : "half"))}
            onPointerDown={(e) => { dragRef.current = { y: e.clientY, size: listSize }; try { (e.currentTarget as HTMLButtonElement).setPointerCapture(e.pointerId); } catch { /* old browser */ } }}
            onPointerCancel={() => { dragRef.current = null; }}
            onPointerUp={(e) => {
              const d = dragRef.current; dragRef.current = null;
              if (!d || Math.abs(e.clientY - d.y) < 24) return; // a tap: onClick handles it
              e.preventDefault();
              const order = ["peek", "half", "full"] as const;
              const step = e.clientY < d.y ? 1 : -1;
              setListSize(order[Math.min(2, Math.max(0, order.indexOf(d.size) + step * (Math.abs(e.clientY - d.y) > 180 ? 2 : 1)))]);
              (e.currentTarget as HTMLButtonElement).dataset.dragged = "1";
            }}
            onClickCapture={(e) => { const t = e.currentTarget as HTMLButtonElement; if (t.dataset.dragged) { delete t.dataset.dragged; e.stopPropagation(); e.preventDefault(); } }}>
            <i className="fc-bids-grip" aria-hidden="true" />
            {listCollapsed ? `▲ ${list.length} invitation${list.length === 1 ? "" : "s"}${todayInfo.total ? ` · ${todayInfo.sent} of ${todayInfo.total} due today sent` : checklist.todo.length ? ` · ${checklist.todo.length} to bid` : ""}` : listSize === "half" ? "▲ Pull up for the whole list" : "▼ Smaller (see the map)"}
          </button>
          {!listCollapsed ? <button type="button" className="fc-bids-tomap" data-hpd-smoke="fc-bids-peek" onClick={() => setListSize("peek")}>🗺 Map</button> : null}
          {checklist.rows.length ? (
            <section className={`fc-checklist${checklistOpen ? "" : " is-closed"}`} data-hpd-smoke="fc-checklist">
              <button type="button" className="fc-checklist-head" data-hpd-smoke="fc-checklist-toggle" aria-expanded={checklistOpen} onClick={() => setChecklistOpen((v) => { const next = !v; try { localStorage.setItem(`hpd-checklist-${today}`, next ? "open" : "closed"); } catch {} return next; })}>
                <b>☀️ Bid checklist · {checklist.sent} of {checklist.total} sent</b>
                <span>{checklist.todo.length ? `${checklist.todayLeft} due today, ${checklist.todo.length - checklist.todayLeft} tomorrow still to bid` : "everything due today and tomorrow is sent"}{checklist.missed ? ` · ${checklist.missed} past due without a bid` : ""}</span>
                <i className="fc-checklist-bar" aria-hidden="true"><i style={{ width: `${checklist.total ? Math.round((checklist.sent / checklist.total) * 100) : 0}%` }} /></i>
              </button>
              {sitting?.done ? (
                <p className="fc-sitting-summary" data-hpd-smoke="fc-sitting-summary">
                  🎯 Sitting done: {sitting.omos.length - sitting.skipped.length - checklist.todo.filter((r) => sitting.omos.includes(r.omo) && !sitting.skipped.includes(r.omo)).length} sent{sitting.skipped.length ? `, ${sitting.skipped.length} skipped (${sitting.skipped.join(", ")})` : ""}.
                  <button type="button" onClick={() => setSitting(null)}>OK</button>
                </p>
              ) : null}
              {checklist.todo.length > 1 && !sitting ? (
                <button type="button" className="fc-sitting-start" data-hpd-smoke="fc-sitting-start" onClick={startSitting}>🎯 Bid all {checklist.todo.length} in a row · best price filled in</button>
              ) : null}
              {checklistOpen ? (
                <div className="fc-cl-rows" role="list">
                  {checklist.rows.map((r) => {
                    const bid = (bids || []).find((b) => b.omo === r.omo);
                    const icon = { "not-priced": "○", saved: "💾", pending: "⏳", confirmed: "✓", failed: "!", past: "✕", "no-bid": "🚫" }[r.state];
                    const stateText = { "not-priced": "no price yet", saved: "price saved, not sent", pending: "fax going through", confirmed: "sent and confirmed", failed: "fax failed: resend", past: "past due, no bid", "no-bid": `no bid${noBids[r.omo]?.reason ? `: ${noBids[r.omo].reason}` : ""}` }[r.state];
                    return (
                      <div key={r.omo} role="listitem" className={`fc-cl-row is-${r.state}${urgency(r.minutesLeft, r.state === "pending" || r.state === "confirmed" || r.state === "no-bid") ? ` is-${urgency(r.minutesLeft, r.state === "pending" || r.state === "confirmed" || r.state === "no-bid")}` : ""}`} data-hpd-smoke="fc-checklist-row" data-omo={r.omo}>
                        <span className="fc-cl-icon" aria-hidden="true">{icon}</span>
                        <span className="fc-cl-main">
                          <b>{r.omo}{r.easy ? <em> · easy win</em> : null}</b>
                          <small>{r.address}{r.borough ? ` · ${r.borough}` : ""}</small>
                          <small>{r.day === "today" ? "Today" : "Tomorrow"} {r.bidDueTime}{earlyDeadline(r.bidDueTime) ? <em className="fc-cl-early"> early deadline</em> : null} · {timeLeft(r.minutesLeft)} · {stateText}</small>
                          {(() => {
                            const u = urgency(r.minutesLeft, r.state === "pending" || r.state === "confirmed" || r.state === "no-bid");
                            return u === "send-now" ? <small className="fc-cl-urgent" data-hpd-smoke="fc-cl-urgent">⚠️ Send now: a fax can take up to 25 min and HPD&apos;s line is busy before the deadline.</small>
                              : u === "too-late" ? <small className="fc-cl-urgent is-late" data-hpd-smoke="fc-cl-urgent">⛔ It may arrive too late: send it now and call HPD to say it&apos;s coming.</small> : null;
                          })()}
                        </span>
                        {bid && (r.state === "not-priced" || r.state === "saved" || r.state === "failed") ? (
                          <button type="button" data-hpd-smoke="fc-checklist-bid" onClick={() => openFromChecklist(r.omo)}>{r.state === "not-priced" && r.best ? <>Bid {money(r.best)}<small>wins ~{Math.round((r.chance || 0) * 100)}%</small></> : r.state === "failed" ? "Resend" : "Review & send"}</button>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </section>
          ) : null}
          {sessionOn ? (
            <div className={`fc-session${todayInfo.allDone ? " is-done" : ""}`} data-hpd-smoke="fc-session">
              <div className="fc-session-head">
                <b>{todayInfo.allDone ? "✓ All bids due today sent and confirmed" : "Bidding session on"}</b>
                <button type="button" onClick={() => void endSession()}>End</button>
              </div>
              <p data-hpd-smoke="fc-session-count"><b>{todayInfo.sent} of {todayInfo.total}</b> due today sent · <b>{todayInfo.confirmed}</b> confirmed{todayInfo.pending ? ` · ${todayInfo.pending} going through` : ""}{todayInfo.failed ? ` · ${todayInfo.failed} failed` : ""}</p>
              {todayInfo.notSent.length ? (
                <ul className="fc-session-alerts" data-hpd-smoke="fc-session-alerts">{todayInfo.notSent.map((r) => (
                  <li key={r.omo}><button type="button" onClick={() => { const b = list.find((x) => x.omo === r.omo); if (b) openBid(b); }}>⚠ <b>{r.omo}</b> due {r.bidDueTime} · {leftText(r.minutesLeft)} · {r.state === "failed" ? "fax FAILED: resend" : r.state === "saved" ? "price saved, not sent" : "not priced yet"}</button></li>
                ))}</ul>
              ) : null}
            </div>
          ) : todayInfo.total ? (
            <button type="button" className="fc-session-start" data-hpd-smoke="fc-session-start" onClick={() => void startSession()}>
              ▶ Start bidding · {todayInfo.total} due today{todayInfo.notSent.length ? ` · ${todayInfo.notSent.length} not sent` : " · all sent"}
            </button>
          ) : null}
          <div className="fc-bid-tabs" role="tablist">
            <button type="button" role="tab" aria-selected={tab === "open"} className={tab === "open" ? "is-active" : ""} onClick={() => setTab("open")}>Open ({shownBids.length})</button>
            <button type="button" role="tab" aria-selected={tab === "mine"} className={tab === "mine" ? "is-active" : ""} data-hpd-smoke="fc-bids-mine" onClick={() => setTab("mine")}>Mine ({sentCount})</button>
            <button type="button" role="tab" aria-selected={tab === "stats"} className={tab === "stats" ? "is-active" : ""} data-hpd-smoke="fc-bids-stats" onClick={() => setTab("stats")}>Stats</button>
            <button type="button" role="tab" aria-selected={tab === "history"} className={tab === "history" ? "is-active" : ""} data-hpd-smoke="fc-bids-history" onClick={() => setTab("history")}>History</button>
          </div>
          {tab === "open" ? (
            bids === null ? <p>Loading invitations…</p> : shownBids.length ? (
              <ol>{shownBids.map((bid) => {
                const due = dueWhen(bid);
                const b = badge(currentRecord(bid, records));
                const again = earlierRounds(bid, records)[0];
                const ew = stats && !currentRecord(bid, records) ? easyWin(bid.description, stats.workPrices) : null;
                return (
                  <li key={bid.omo}>
                    <button type="button" onClick={() => openBid(bid)}>
                      <span className="fc-bid-row"><b>{bid.omo}</b> <span className={`fc-bid-chip is-${due.tone}`}>{dueLabel(bid)}</span>{b ? <span className={`fc-bid-chip is-${b.tone}`} data-hpd-smoke="fc-bid-badge">{b.text}</span> : null}{noBidOf(bid) && !b ? <span className="fc-bid-chip is-nobid" data-hpd-smoke="fc-bid-nobid-chip">🚫 No bid</span> : null}{again ? <span className="fc-bid-chip is-again" data-hpd-smoke="fc-bid-again-chip">🔁 bid before · {money(again.price)}</span> : null}{ew ? <span className="fc-bid-chip is-easy" data-hpd-smoke="fc-bid-easy-chip">Easy win · ~{money(ew.suggested)}</span> : null}</span>
                      {!currentRecord(bid, records) && !ew && rowHelp.get(bid.omo) ? (() => { const h = rowHelp.get(bid.omo)!; const best = bestWithFloor(h, floors[floorKind(bid.description)]); return <span className={`fc-bid-predict is-${h.confidence}`} data-hpd-smoke="fc-bid-predict">💰 Best ~{money(best.price)} (wins ~{Math.round(best.chance * 100)}%) · middle {money(h.middle)}{h.confidence === "low" ? " · rough guide" : ""}</span>; })() : null}
                      {(() => { const sm = rowSummary.get(bid.omo); if (!sm?.lines.length) return null; const mp = calcPrice(sm, rates, calcContext(sm, readScope(bid.description).tasks, bid.borough || "")); return <span className="fc-bid-sum" data-hpd-smoke="fc-bid-sum">📋 {sm.lines.map(lineText).join(" + ")}{mp.complete ? <b data-hpd-smoke="fc-bid-row-mine"> · 🧮 My price {money(mp.total)}</b> : null}</span>; })()}
                      <span>{bid.address}{bid.borough ? ` · ${bid.borough}` : ""}</span>
                      <small>{due.text}</small>
                    </button>
                    {bid.itbFile ? (
                      <button type="button" className="fc-bid-pages-btn" data-hpd-smoke="fc-bid-pages-btn" aria-label={`HPD's pages for ${bid.omo}`} onClick={() => setPagesFor(bid)}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        {thumbs[bid.omo] ? <img src={thumbs[bid.omo]} alt="" data-hpd-smoke="fc-bid-thumb" /> : <span aria-hidden="true">📄</span>}
                        <small>Pages</small>
                      </button>
                    ) : null}
                  </li>
                );
              })}</ol>
            ) : <p>{list.length ? "No invitations due that day. Pick another day above." : "No open invitations right now. New ones are read through the day (8 AM to 9 PM)."}</p>
          ) : tab === "stats" ? (
            <>
              <section className="fc-stats-block fc-floors" data-hpd-smoke="fc-floors">
                <h4>🧾 Your costs</h4>
                <p className="fc-stats-note">What each kind of work costs you (materials and labor), counted the same way as the price. The calculator shows your profit on every bid. Kept on this phone.</p>
                <div className="fc-costs" data-hpd-smoke="fc-costs">
                  {COST_ITEMS.map((it) => {
                    const c = costs[it.key];
                    const e = costEdit[it.key] || { material: c ? String(c.material || "") : "", labor: c ? String(c.labor || "") : "" };
                    const save = (next: { material: string; labor: string }) => { const m = Number(next.material.replace(/[^0-9.]/g, "")) || 0, l = Number(next.labor.replace(/[^0-9.]/g, "")) || 0; setCosts(saveCost(it.key, m || l ? { material: m, labor: l } : null)); };
                    return (
                      <div key={it.key} className="fc-cost-row" data-hpd-smoke="fc-cost-row" data-key={it.key}>
                        <span><b>{it.label}</b><small>{it.unit}{it.note ? ` · ${it.note}` : ""}</small></span>
                        <label>Materials $<input inputMode="decimal" aria-label={`Materials ${it.unit} for ${it.label}`} data-hpd-smoke="fc-cost-material" value={e.material} onChange={(ev) => setCostEdit((x) => ({ ...x, [it.key]: { ...e, material: ev.target.value } }))} onBlur={() => save(e)} /></label>
                        <label>Labor $<input inputMode="decimal" aria-label={`Labor ${it.unit} for ${it.label}`} data-hpd-smoke="fc-cost-labor" value={e.labor} onChange={(ev) => setCostEdit((x) => ({ ...x, [it.key]: { ...e, labor: ev.target.value } }))} onBlur={() => save(e)} /></label>
                      </div>
                    );
                  })}
                </div>
                <h4>Your rates</h4>
                {Object.keys(rates).length ? (
                  <ul data-hpd-smoke="fc-rates-list">{Object.entries(rates).sort((x, y) => x[0].localeCompare(y[0])).map(([key, amount]) => (
                    <li key={key}><span>{key.replace(/-/g, " ")}</span><b>{money2(amount).replace(".00", "")} {unitWord(unitOf(key))}</b><button type="button" data-hpd-smoke="fc-rates-remove" onClick={() => setRates(saveRate(key, null))}>Remove</button></li>
                  ))}</ul>
                ) : <p className="fc-stats-note">None yet. On a bid, tap a line under &quot;My price&quot; to set what you charge (per sq ft, per door, each part).</p>}
                <h4>Your minimums</h4>
                {Object.keys(floors).length ? (
                  <ul>{Object.entries(floors).sort((x, y) => x[0].localeCompare(y[0])).map(([kind, amount]) => (
                    <li key={kind}><span>{kind}</span><b>{money(amount)}</b><button type="button" data-hpd-smoke="fc-floors-remove" onClick={() => setFloors(saveFloor(kind, null))}>Remove</button></li>
                  ))}</ul>
                ) : <p className="fc-stats-note">None yet. Open a bid and tap &quot;Set my minimum&quot; under the best price: the least you&apos;ll take for that kind of work. The best price never goes below it.</p>}
              </section>
              <BidStatsView stats={stats} loading={market === null} jobs={marketJobs} learned={learned} />
            </>
          ) : tab === "history" ? (
            <JobHistory jobs={marketJobs} loading={market === null} />
          ) : (
            <div data-hpd-smoke="fc-my-bids">
              <p className="fc-bid-rate">{rate.decided ? `Won ${rate.won} of ${rate.decided} decided (${rate.percent}%)` : "No results yet"} · {rate.sent} sent{mine.length > sentCount ? ` · ${mine.length - sentCount} saved, not sent` : ""}</p>
              <ol>{mine.map((rec) => {
                const res = bidResult(rec, awarded, today, marketAwards);
                const yourPrice = rec.sentPrice || rec.price;
                const fax = faxState(rec);
                const openBidData = list.find((b) => b.omo === rec.omo);
                return (
                  <li key={rec.omo}>
                    <button type="button" data-hpd-smoke="fc-my-bid" onClick={() => (openBidData ? openBid(openBidData) : setOpenRecord((o) => (o === rec.omo ? "" : rec.omo)))}>
                      <span className="fc-bid-row"><b>{rec.omo}</b> <span className="fc-bid-chip">{money2(rec.sentPrice || rec.price)}</span>
                        {rec.status === "saved" ? <span className="fc-bid-chip is-saved">saved, not sent</span>
                          : <span className={`fc-bid-chip is-${res.result === "won" ? "sent" : res.result === "lost" ? "past" : "later"}`}>{res.result === "won" ? `Won · awarded ${money(res.amount || 0)}` : res.result === "lost" ? (res.winningPrice ? `Lost · won at ${money(res.winningPrice)}` : "Not awarded") : "Awaiting award"}</span>}
                      </span>
                      <span>{rec.address}{rec.borough ? ` · ${rec.borough}` : ""}</span>
                      <small>Due {dueLabel(rec)}{rec.status !== "saved" ? ` · ${FAX_TEXT[fax as keyof typeof FAX_TEXT]}` : ""}{rec.sentAt && rec.status !== "saved" ? ` · sent ${when(rec.sentAt)}` : ""}{rec.revisions?.length ? ` · revised ${rec.revisions.length}x` : ""}</small>
                      {res.winningPrice && yourPrice > res.winningPrice ? <small className="fc-bid-lost" data-hpd-smoke="fc-bid-lost-by">You bid {money(yourPrice)}: {money(yourPrice - res.winningPrice)} ({Math.round(((yourPrice - res.winningPrice) / res.winningPrice) * 100)}%) above the winning price</small> : null}
                    </button>
                    {openRecord === rec.omo ? (
                      <div className="fc-my-bid-detail" data-hpd-smoke="fc-my-bid-detail">
                        <BidTimeline record={rec} />
                        <ol className="fc-my-bid-log">{bidHistory(rec).map((e, i) => <li key={`${e.at}-${i}`}><time>{when(e.at)}</time> <span>{e.what}</span></li>)}</ol>
                      </div>
                    ) : null}
                  </li>
                );
              })}</ol>
              {!mine.length ? <p>No bids yet. Save a price on an invitation to start.</p> : null}
            </div>
          )}
        </aside>
        </>
      )}
    </>
  );
}

const pct = (v: number) => `${Math.round(v * 100)}%`;
const ADVICE = { raise: "Raise your price", lower: "Others win cheaper", ok: "", few: "" } as const;

function GroupTable({ title, rows, smoke }: { title: string; rows: Group[]; smoke: string }) {
  return (
    <section className="fc-stats-block" data-hpd-smoke={smoke}>
      <h4>{title}</h4>
      <table>
        <thead><tr><th></th><th>Won</th><th>You</th><th>Others</th><th>90 days</th></tr></thead>
        <tbody>{rows.map((g) => (
          <tr key={g.name} className={`is-${g.advice}`}>
            <th>{g.name}{ADVICE[g.advice] ? <em>{ADVICE[g.advice]}</em> : null}</th>
            <td>{g.won}/{g.invitations}<small>{pct(g.winRate)}</small></td>
            <td>{g.yourPrice ? money(g.yourPrice) : "–"}</td>
            <td>{g.othersPrice ? money(g.othersPrice) : "–"}</td>
            <td className={g.change == null ? "" : g.change > 0 ? "is-up" : g.change < 0 ? "is-down" : ""}>{g.change == null ? "–" : `${g.change > 0 ? "▲" : g.change < 0 ? "▼" : ""}${Math.abs(g.change)}%`}</td>
          </tr>
        ))}</tbody>
      </table>
    </section>
  );
}

// Bid stats: every invitation HPD awarded, yours or not, with the winning price (NYC Open Data).
function BidStatsView({ stats, loading, jobs, learned }: { stats: ReturnType<typeof bidStats> | null; loading: boolean; jobs: MarketJob[]; learned: Map<string, { price: number; omo: string }[]> }) {
  if (!stats) return <p>{loading ? "Loading bid history…" : "No award history yet."}</p>;
  const o = stats.overall;
  return (
    <div className="fc-stats" data-hpd-smoke="fc-bid-stats">
      <div className="fc-stats-tiles">
        <div><b>{o.won} / {o.invitations}</b><small>invitations won ({pct(o.winRate)})</small></div>
        <div><b>{pct(stats.last90.winRate)}</b><small>last 90 days ({stats.last90.won}/{stats.last90.invitations})</small></div>
        <div><b>{money(o.moneyWon)}</b><small>you won</small></div>
        <div><b>{money(o.moneyLost)}</b><small>went to other contractors</small></div>
      </div>
      <SentBidStats />
      <p className="fc-stats-note">From {o.invitations.toLocaleString()} invitations you received that HPD awarded, with the price each was won at (NYC Open Data, updated nightly). &quot;You&quot; is your typical winning price, &quot;Others&quot; other contractors&apos; typical winning price. Won counts every invitation received, including ones you didn&apos;t bid on.</p>
      {stats.moves.length ? (
        <section className="fc-stats-block" data-hpd-smoke="fc-stats-moves">
          <h4>Where to change your price</h4>
          <ul className="fc-stats-moves">{stats.moves.map((g) => (
            <li key={g.name} className={`is-${g.advice}`}>
              <b>{g.advice === "raise" ? "▲ Raise" : "▼ Sharpen"} · {g.name}</b>
              <span>{g.advice === "raise"
                ? `Your wins here were ${Math.round((1 - (g.under || 1)) * 100)}% under what other contractors won the same work for (${g.won} of ${g.invitations} won). You can charge more and still come in under them.`
                : `You won ${g.won} of ${g.invitations}. Winners came in about ${Math.round((1 - (g.beaten || 1)) * 100)}% under your usual price for the same work${g.change != null ? `; prices here ${g.change > 0 ? "up" : "down"} ${Math.abs(g.change)}% lately` : ""}. Sharpen your price to win more.`}</span>
            </li>
          ))}</ul>
        </section>
      ) : null}
      <section className="fc-stats-block" data-hpd-smoke="fc-stats-months">
        <h4>Your win rate by month</h4>
        <table className="fc-month-table">
          <thead><tr><th>Month</th><th>Won</th><th>Rate</th><th>You won</th></tr></thead>
          <tbody>{stats.byMonth.slice(0, 15).map((m) => (
            <tr key={m.month} className={m.winRate < 0.2 ? "is-low" : m.winRate >= 0.3 ? "is-high" : ""}>
              <th>{new Date(`${m.month}-15T12:00:00Z`).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" })}</th>
              <td>{m.won} of {m.invitations}</td>
              <td><b>{Math.round(m.winRate * 100)}%</b></td>
              <td>{money(m.moneyWon)}</td>
            </tr>
          ))}</tbody>
        </table>
        <p className="fc-stats-note">By award month: invitations you received that HPD awarded, and how many you won (from your award emails).</p>
      </section>
      <ShouldHaveBid stats={stats} />
      <PriceList rows={stats.priceList} jobs={jobs} learned={learned} />
      <GroupTable title="By kind of work" rows={stats.byTrade} smoke="fc-stats-trade" />
      <GroupTable title="By borough" rows={stats.byBoro} smoke="fc-stats-boro" />
      <GroupTable title="By neighborhood (8+ invitations)" rows={stats.byArea.slice(0, 25)} smoke="fc-stats-area" />
      <section className="fc-stats-block" data-hpd-smoke="fc-stats-losses">
        <h4>Recent jobs won by others</h4>
        <ol className="fc-stats-losses">{stats.losses.map((l) => (
          <li key={l.omo}><b>{l.omo} · {money(l.amount)}</b><span>{l.address}{l.area ? ` · ${l.area}` : ""}</span><small>{l.trade} · awarded {l.awardDate.slice(5, 7)}/{l.awardDate.slice(8, 10)}</small></li>
        ))}</ol>
      </section>
    </div>
  );
}

// Where this bid stands, with the time of each step (kept with the bid): price saved, package filled,
// sent to HPD, confirmed by HumbleFax.
function BidTimeline({ record }: { record?: BidRecord | null }) {
  const at = (v?: string) => (v ? new Date(v).toLocaleString("en-US", { timeZone: "America/New_York", month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" }) : "");
  const sent = record && record.status !== "saved" ? record.sentAt : undefined;
  const failed = record?.status === "failed";
  const steps: { label: string; when: string; done: boolean; bad?: boolean }[] = [
    { label: record ? `Price ${money2(record.price)}` : "Price", when: at(record?.savedAt), done: !!record },
    { label: "Package filled", when: record?.filledAt && record.filledPrice === record.price ? at(record.filledAt) : "", done: !!record?.filledAt && record.filledPrice === record.price },
    { label: failed ? "Fax failed" : "Sent to HPD", when: at(sent), done: !!sent, bad: failed },
    { label: "Confirmed", when: at(record?.confirmedAt), done: !!record?.confirmedAt && !failed },
  ];
  return (
    <ol className="fc-bid-timeline" data-hpd-smoke="fc-bid-timeline">
      {steps.map((st) => (
        <li key={st.label} className={st.bad ? "is-bad" : st.done ? "is-done" : ""}>
          <b>{st.bad ? "✗" : st.done ? "✓" : "○"} {st.label}</b>
          <small>{st.when || "not yet"}</small>
        </li>
      ))}
    </ol>
  );
}

// One tap to reconnect Google (sending the fax uses your Gmail); comes back to the invitations afterwards.
function ReconnectGoogle({ text }: { text: string }) {
  return (
    <form className="fc-reconnect" method="post" action="/api/drive/start?back=%2Fmap%2F%3Fbids%3D1" data-hpd-smoke="fc-reconnect-google">
      <span>⚠️ {text}</span>
      <button type="submit">Reconnect Google</button>
    </form>
  );
}

// HPD writes the description as one long line: start each numbered item ("1)", "2-", "3.") on its own
// line. Every word stays exactly as HPD wrote it.
export function readableDescription(text: string) {
  return text
    .replace(/\s+(?=\d{1,2}\s?\)\s)/g, "\n")
    .replace(/\s+(?=\d{1,2}\s?[-.]\s(?=[A-Za-z]))/g, "\n")
    .replace(/\s+(?=\*[A-Za-z])/g, "\n") // HPD's standard *NOTES* on their own line
    .replace(/\s+(?=NYC HPD EMERGENCY OPERATIONS)/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

// The price HPD already has, when a new one has been saved since: the revised package crosses it out.
function revisedFrom(record?: BidRecord) {
  if (!record) return undefined;
  const sent = record.status !== "saved" ? record.sentPrice : record.priorPrice;
  return sent && sent > 0 && sent !== record.price ? sent : undefined;
}

// Jobs awarded to someone else in the last 90 days for more than your usual price for that exact work.
function ShouldHaveBid({ stats }: { stats: ReturnType<typeof bidStats> }) {
  const [all, setAll] = useState(false);
  const rows = all ? stats.shouldHaveBid : stats.shouldHaveBid.slice(0, 15);
  if (!stats.shouldHaveBid.length) return null;
  return (
    <section className="fc-stats-block" data-hpd-smoke="fc-stats-should">
      <h4>Should have bid · last 90 days</h4>
      <p className="fc-stats-note"><b>{stats.shouldHaveBid.length} jobs</b> went to other contractors for more than you usually charge for that exact work: <b>{money(stats.shouldHaveBidTotal)}</b> at your usual prices. Each is a real award from HPD&apos;s data.</p>
      <ol className="fc-stats-losses">{rows.map((j) => (
        <li key={j.omo}>
          <b>{j.omo} · won at {money(j.amount)} · your usual {money(j.yours)}</b>
          <span>{j.address}{j.area ? ` · ${j.area}` : ""}</span>
          <small>{j.work} · awarded {j.awardDate.slice(5, 7)}/{j.awardDate.slice(8, 10)}/{j.awardDate.slice(2, 4)} · your usual is from {j.yoursN} of your wins</small>
        </li>
      ))}</ol>
      {stats.shouldHaveBid.length > 15 ? <button type="button" className="fc-bid-link" onClick={() => setAll((v) => !v)}>{all ? "Show fewer" : `Show all ${stats.shouldHaveBid.length}`}</button> : null}
    </section>
  );
}

// Your usual price next to what other contractors won the same work for, with a suggested price and how
// many of the recent winners it would have beaten.
function PriceList({ rows, jobs, learned }: { rows: WorkPrice[]; jobs: MarketJob[]; learned: Map<string, { price: number; omo: string }[]> }) {
  const [openKey, setOpenKey] = useState("");
  if (!rows.length) return null;
  return (
    <section className="fc-stats-block" data-hpd-smoke="fc-stats-prices">
      <h4>Your prices vs the market</h4>
      <p className="fc-stats-note">Same work, same size. &quot;Winners&quot; = other contractors&apos; typical winning price in the last 12 months. &quot;Suggested&quot; = 10% under that, never below your usual. &quot;Beats&quot; = how many of those winning prices the suggested price is under.</p>
      <table className="fc-price-list">
        <thead><tr><th>Work</th><th>You</th><th>Winners</th><th>Suggested</th></tr></thead>
        <tbody>{rows.map((p) => {
          const b = beats(p, p.suggested);
          return (
            <Fragment key={p.key}>
            <tr className={`${p.suggested > p.yours ? "is-raise" : ""} is-tappable${openKey === p.key ? " is-open" : ""}`} data-hpd-smoke="fc-price-row" onClick={() => setOpenKey(openKey === p.key ? "" : p.key)}>
              <th>{p.label}<em className="fc-price-more">{openKey === p.key ? "▲ hide history" : "▼ price history"}</em></th>
              <td>{money(p.yours)}<small>{p.yoursN} wins</small>{learned.get(p.key)?.length ? <small className="fc-price-mine" data-hpd-smoke="fc-price-mine">your last bid {money(learned.get(p.key)![0].price)}</small> : null}</td>
              <td>{money(p.others)}<small>{p.othersN} jobs</small></td>
              <td><b>{money(p.suggested)}</b><small>beats {b.n}/{b.of}</small></td>
            </tr>
            {openKey === p.key ? <tr className="fc-price-detail"><td colSpan={4}><WorkHistoryView jobs={jobs} work={p} /></td></tr> : null}
            </Fragment>
          );
        })}</tbody>
      </table>
    </section>
  );
}

// Every awarded invitation: search and filter, with what each was won for and by whom.
function JobHistory({ jobs, loading }: { jobs: MarketJob[]; loading: boolean }) {
  const rows = useMemo(() => historyRows(jobs), [jobs]);
  const [filter, setFilter] = useState<HistoryFilter>({ text: "", trade: "", boro: "", who: "all" });
  const [limit, setLimit] = useState(40);
  const [openOmo, setOpenOmo] = useState("");
  const result = useMemo(() => filterHistory(rows, filter), [rows, filter]);
  if (!rows.length) return <p>{loading ? "Loading job history…" : "No award history yet."}</p>;
  const trades = [...new Set(rows.map((r) => r.trade))].sort();
  const boros = [...new Set(rows.map((r) => r.boro).filter(Boolean))].sort();
  const set = (patch: Partial<HistoryFilter>) => { setFilter((f) => ({ ...f, ...patch })); setLimit(40); };
  return (
    <div className="fc-stats fc-history" data-hpd-smoke="fc-history">
      <input className="fc-history-search" placeholder="Search OMO, address, neighborhood or work (e.g. glass)" aria-label="Search job history" data-hpd-smoke="fc-history-search" value={filter.text} onChange={(e) => set({ text: e.target.value })} />
      <div className="fc-history-filters">
        <select aria-label="Kind of work" data-hpd-smoke="fc-history-trade" value={filter.trade} onChange={(e) => set({ trade: e.target.value })}><option value="">All work</option>{trades.map((t) => <option key={t} value={t}>{t}</option>)}</select>
        <select aria-label="Borough" data-hpd-smoke="fc-history-boro" value={filter.boro} onChange={(e) => set({ boro: e.target.value })}><option value="">All boroughs</option>{boros.map((b) => <option key={b} value={b}>{b}</option>)}</select>
        <select aria-label="Who won" data-hpd-smoke="fc-history-who" value={filter.who} onChange={(e) => set({ who: e.target.value as HistoryFilter["who"] })}><option value="all">Everyone</option><option value="you">You won</option><option value="others">Others won</option></select>
      </div>
      <p className="fc-history-summary" data-hpd-smoke="fc-history-summary">
        <b>{result.count.toLocaleString()} jobs</b> · typical {money(result.median)} · {money(result.total)} in all · you won {result.yours} ({result.count ? Math.round((result.yours / result.count) * 100) : 0}%){result.yours && result.count > result.yours ? ` · yours typical ${money(result.yoursMedian)}, others ${money(result.othersMedian)}` : ""}
      </p>
      <ol className="fc-history-list">{result.rows.slice(0, limit).map((r) => (
        <li key={r.omo} className={r.won ? "is-yours" : ""}>
          <button type="button" onClick={() => setOpenOmo(openOmo === r.omo ? "" : r.omo)}>
            <span><b>{r.omo} · {money(r.amount)}</b><em>{r.won ? "you won" : "other contractor"}</em></span>
            <span>{r.address}{r.area ? ` · ${r.area}` : ""}{r.boro ? ` · ${r.boro}` : ""}</span>
            <small>{r.summary} · awarded {r.awardDate.slice(5, 7)}/{r.awardDate.slice(8, 10)}/{r.awardDate.slice(2, 4)}</small>
          </button>
          {openOmo === r.omo ? <p className="fc-history-desc" data-hpd-smoke="fc-history-desc">{r.description}</p> : null}
        </li>
      ))}</ol>
      {result.rows.length > limit ? <button type="button" className="fc-bid-fill is-secondary" onClick={() => setLimit((n) => n + 60)}>Show more ({(result.rows.length - limit).toLocaleString()} left)</button> : null}
    </div>
  );
}

// Month-by-month winning prices for one kind of work: yours (blue) and other contractors' (orange).
function WorkHistoryView({ jobs, work }: { jobs: MarketJob[]; work: WorkPrice }) {
  const h = useMemo(() => workHistory(jobs, work.key), [jobs, work.key]);
  const [tip, setTip] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const [all, setAll] = useState(false);
  if (!h.months.length) return <p className="fc-stats-note">No awards for this work yet.</p>;
  const W = 340, H = 170, L = 44, R = 12, T = 14, B = 26;
  const vals = h.months.flatMap((m) => [m.yours, m.others]).filter((v): v is number => v != null);
  const top = Math.max(...vals), low = Math.min(...vals);
  const step = top - low > 1500 ? 500 : top - low > 600 ? 200 : top - low > 250 ? 100 : 50;
  const y0 = Math.max(0, Math.floor((low * 0.9) / step) * step), y1 = Math.ceil((top * 1.05) / step) * step;
  const x = (i: number) => L + (h.months.length === 1 ? (W - L - R) / 2 : (i * (W - L - R)) / (h.months.length - 1));
  const y = (v: number) => T + ((y1 - v) * (H - T - B)) / (y1 - y0 || 1);
  const ticks: number[] = []; for (let v = y0; v <= y1; v += step) ticks.push(v);
  const path = (k: "yours" | "others") => {
    let d = "", pen = false;
    h.months.forEach((m, i) => { const v = m[k]; if (v == null) { pen = false; return; } d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`; pen = true; });
    return d;
  };
  const label = (m: string) => new Date(`${m}-15T12:00:00Z`).toLocaleDateString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" });
  const last = (k: "yours" | "others") => { for (let i = h.months.length - 1; i >= 0; i--) if (h.months[i][k] != null) return i; return -1; };
  const ly = last("yours"), lo = last("others");
  const t = tip != null ? h.months[tip] : null;
  return (
    <div className="fc-workhist" data-hpd-smoke="fc-work-history">
      <div className="fc-workhist-legend"><span><i className="is-you" />You</span><span><i className="is-others" />Other winners</span><small>typical winning price per month</small></div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Monthly winning prices for ${work.label}`} onMouseLeave={() => setTip(null)}>
        {ticks.map((v) => <g key={v}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className="grid" /><text x={L - 6} y={y(v) + 3.5} textAnchor="end" className="axis">${v >= 1000 ? `${(v / 1000).toFixed(v % 1000 ? 1 : 0)}k` : v}</text></g>)}
        {h.months.map((m, i) => (i % Math.ceil(h.months.length / 5) === 0 || i === h.months.length - 1) ? <text key={m.month} x={x(i)} y={H - 8} textAnchor="middle" className="axis">{label(m.month)}</text> : null)}
        {tip != null ? <line x1={x(tip)} x2={x(tip)} y1={T} y2={H - B} className="cross" /> : null}
        <path d={path("others")} className="line is-others" />
        <path d={path("yours")} className="line is-you" />
        {h.months.map((m, i) => <g key={m.month}>
          {m.others != null ? <circle cx={x(i)} cy={y(m.others)} r={4} className="dot is-others" /> : null}
          {m.yours != null ? <circle cx={x(i)} cy={y(m.yours)} r={4} className="dot is-you" /> : null}
        </g>)}
        {lo >= 0 ? <text x={Math.min(x(lo) + 6, W - R)} y={y(h.months[lo].others!) - 7} textAnchor={x(lo) > W - 60 ? "end" : "start"} className="direct">${h.months[lo].others}</text> : null}
        {ly >= 0 ? <text x={Math.min(x(ly) + 6, W - R)} y={y(h.months[ly].yours!) + 15} textAnchor={x(ly) > W - 60 ? "end" : "start"} className="direct">${h.months[ly].yours}</text> : null}
        {h.months.map((m, i) => <rect key={m.month} x={x(i) - (W - L - R) / Math.max(h.months.length - 1, 1) / 2} y={T} width={(W - L - R) / Math.max(h.months.length - 1, 1)} height={H - T - B} fill="transparent" onMouseEnter={() => setTip(i)} onClick={() => setTip(i)} />)}
      </svg>
      <p className="fc-workhist-tip" data-hpd-smoke="fc-work-tip">{t ? <><b>{label(t.month)}</b> · other winners {t.others != null ? `${money(t.others)} (${t.othersN} job${t.othersN === 1 ? "" : "s"})` : "none"} · you {t.yours != null ? `${money(t.yours)} (${t.yoursN} win${t.yoursN === 1 ? "" : "s"})` : "none"}</> : "Tap a month to see its prices."}</p>
      <button type="button" className="fc-bid-link" onClick={() => setTable((v) => !v)}>{table ? "Hide table" : "Show as a table"}</button>
      {table ? (
        <table className="fc-workhist-table" data-hpd-smoke="fc-work-table">
          <thead><tr><th>Month</th><th>Other winners</th><th>You</th></tr></thead>
          <tbody>{[...h.months].reverse().map((m) => <tr key={m.month}><th>{label(m.month)}</th><td>{m.others != null ? `${money(m.others)} · ${m.othersN}` : "–"}</td><td>{m.yours != null ? `${money(m.yours)} · ${m.yoursN}` : "–"}</td></tr>)}</tbody>
        </table>
      ) : null}
      <ol className="fc-stats-losses fc-workhist-jobs">{(all ? h.jobs : h.jobs.slice(0, 8)).map((j) => (
        <li key={j.omo}><b>{j.omo} · {money(j.amount)} · {j.won ? "you won" : "other contractor"}</b><span>{j.address}{j.area ? ` · ${j.area}` : ""} · awarded {j.awardDate.slice(5, 7)}/{j.awardDate.slice(8, 10)}/{j.awardDate.slice(2, 4)}</span></li>
      ))}</ol>
      {h.jobs.length > 8 ? <button type="button" className="fc-bid-link" onClick={() => setAll((v) => !v)}>{all ? "Show fewer" : `All ${h.jobs.length} jobs`}</button> : null}
    </div>
  );
}
