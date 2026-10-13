"use client";
// Invitations to bid on the field map: the envelope button flips the map from your jobs to the open
// invitations (due today later than now, or later; from scripts/fetch_upcoming_bids.py). For each:
// read the job and the invitation, save your price (with help from your past winning bids), review
// the filled package (lib/bid-fill.ts) and send it to HPD's bid fax through HumbleFax. The fax is
// checked against HumbleFax's confirmation email and can be resent. "My bids" tracks every bid sent:
// won, not awarded or pending, and your win rate (lib/bid-records.ts).
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { priceHelp, readScope, winChance, type PricedJob } from "../../lib/bid-price";
import { beats, bidStats, easyWin, historyRows, filterHistory, myPrices, workHistory, workKey, type Group, type HistoryFilter, type MarketJob, type MonthPoint, type WorkPrice } from "../../lib/bid-stats";
import type { UpcomingBid } from "../../lib/bid-fill";
import { HPD_STATUS_WORKER_URL } from "../../lib/paperwork";
import { bidHistory, bidResult, bidsToCheck, checkBidFax, faxState, mergeServerBidsAndKeep, readBidRecords, readSession, saveSession, SESSION_KEY, todaySummary, withLog, type BiddingSession, saveBidRecord, sendBidFax, winRate, type BidRecord } from "../../lib/bid-records";
import "./bids.css";

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
  const [bidsReadAt, setBidsReadAt] = useState("");
  // Invitation PDFs the reader couldn't read (no OMO # or bid due date): shown, never dropped silently.
  const [unread, setUnread] = useState<{ file: string; omo?: string; why: string }[]>([]);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"open" | "mine" | "stats" | "history">("open");
  useEffect(() => {
    const asked = new URLSearchParams(window.location.search).get("tab");
    if (asked === "stats" || asked === "history" || asked === "mine") {
      setTab(asked);
      try { window.history.replaceState(null, "", window.location.pathname); } catch {}
    }
  }, []);
  const [selected, setSelected] = useState<UpcomingBid | null>(null);
  const [records, setRecords] = useState<Record<string, BidRecord>>({});
  const [draft, setDraft] = useState("");
  const [reason, setReason] = useState("");
  // A sent bid is locked: its price changes only through "Revise this bid" (HPD already has it).
  const [revising, setRevising] = useState(false);
  // Description text size (remembered on this phone).
  const [bigText, setBigText] = useState(false);
  useEffect(() => { try { setBigText(localStorage.getItem("hpd-bid-text") === "xl"); } catch {} }, []);
  const [filled, setFilled] = useState<{ omo: string; price: number; previous?: number; url: string; name: string; file: File; bytes: Uint8Array } | null>(null);
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState("");
  const [fullText, setFullText] = useState(false);
  const [showSimilar, setShowSimilar] = useState(false);
  const [session, setSession] = useState<BiddingSession | null>(null);
  const [listCollapsed, setListCollapsed] = useState(false);
  // Which day's invitations to show: all, today, tomorrow or the day after (remembered on the phone).
  const [dayPick, setDayPick] = useState<"all" | "0" | "1" | "2">(() => {
    try { const v = localStorage.getItem("hpd-bids-day"); return v === "0" || v === "1" || v === "2" ? v : "all"; } catch { return "all"; }
  });
  useEffect(() => { try { localStorage.setItem("hpd-bids-day", dayPick); } catch { /* private mode */ } }, [dayPick]);
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
    fetch("/data/upcoming_bids.json", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
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
  const record = selected ? records[selected.omo] : undefined;

  const stats = useMemo(() => (marketJobs.length ? bidStats(marketJobs) : null), [marketJobs]);
  const dayKeys = useMemo(() => [0, 1, 2].map((n) => NY_DAY.format(new Date(clock + n * 86400000))), [clock]);
  const shownBids = useMemo(() => (bids || []).filter((b) => dayPick === "all" || b.bidDue === dayKeys[Number(dayPick)]), [bids, dayPick, dayKeys]);
  // Open invitations that are easy wins (work you win well under what other winners get).
  const rowHelp = useMemo(() => new Map((bids || []).map((b) => [b.omo, market?.length ? priceHelp(b.description, pricing) : null])), [bids, market, pricing]);
  const easyOmos = useMemo(() => new Set((bids || []).filter((b) => stats && easyWin(b.description, stats.workPrices)).map((b) => b.omo)), [bids, stats]);

  const alertOmos = useMemo(() => {
    const day = NY_DAY.format(new Date(clock));
    const hm = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(clock)).split(":").map(Number);
    const t = todaySummary(bids || [], records, day, hm[0] * 60 + hm[1], new Date(clock));
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
        const tone2 = badge(records[bid.omo])?.tone;
        const sent = tone2 === "sent";
        const pendingFax = tone2 === "pending";
        const faxFailed = tone2 === "failed";
        const alertPin = alertOmos.has(bid.omo);
        const easyPin = !sent && !records[bid.omo] && easyOmos.has(bid.omo);
        return L.marker([bid.lat, bid.lng], {
          pane: "fc-bids", title: `${bid.omo} · ${bid.address} · ${dueLabel(bid)}${easyPin ? " · Easy win" : ""}`,
          icon: L.divIcon({ className: `fc-bid-pin is-${tone}${sent ? " is-sent" : ""}${pendingFax ? " is-pending" : ""}${faxFailed ? " is-fax-failed" : ""}${alertPin ? " is-alert" : ""}${easyPin ? " is-easy" : ""}`, html: `<b>${sent ? "✓" : pendingFax ? "⏳" : faxFailed || alertPin ? "!" : dueLabel(bid).split(" ")[0]}</b>${easyPin ? "<i>$</i>" : ""}`, iconSize: [34, 34], iconAnchor: [17, 17] }),
          zIndexOffset: 1000 - TONE_ORDER[tone] * 100,
        }).on("click", () => openBid(bid));
      });
      if (!markers.length) return;
      layerRef.current = L.featureGroup(markers).addTo(map);
      map.fitBounds(layerRef.current.getBounds(), { paddingTopLeft: [30, 150], paddingBottomRight: [30, Math.round(window.innerHeight * 0.4)], maxZoom: 14 });
    });
    return () => { cancelled = true; };
  }, [open, bids, map, records, easyOmos, alertKey, shownBids]); // eslint-disable-line react-hooks/exhaustive-deps
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
  const scope = useMemo(() => readScope(selected?.description || ""), [selected]);
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
    setDraft(records[bid.omo] ? String(records[bid.omo].price) : yourLast ? String(yourLast.price) : "");
    setRevising(false);
    setReason(records[bid.omo]?.reason || "");
  }

  async function savePrice() {
    if (!selected || !(draftValue > 0)) return;
    const now = new Date().toISOString();
    const previous = records[selected.omo];
    const why = reason.trim().slice(0, 200) || undefined;
    const base = {
      ...(previous || { attempts: 0 }), omo: selected.omo, address: selected.address, borough: selected.borough,
      bidDue: selected.bidDue, bidDueTime: selected.bidDueTime, price: draftValue, savedAt: now,
      status: previous && previous.status !== "saved" ? previous.status : "saved", updatedAt: now,
      reason: why,
    } as BidRecord;
    const what = previous && previous.price === draftValue ? `Reason saved: "${why || ""}"` : `Price saved ${money2(draftValue)}${why ? ` ("${why}")` : ""}`;
    await update(withLog(base, what, now));
    if (filled && filled.price !== draftValue) setFilled(null);
  }

  async function buildPackage(price: number) {
    if (!selected) return null;
    const [{ fillBidPackage }, pdf] = await Promise.all([
      import("../../lib/bid-fill"),
      fetch(`/documents/itb/${encodeURIComponent(selected.itbFile)}`).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`invitation PDF: HTTP ${r.status}`)))),
    ]);
    const previous = revisedFrom(records[selected.omo]);
    const rec = records[selected.omo];
    const bytes = await fillBidPackage(pdf, selected, price, previous ? { previousPrice: previous, count: (rec?.revisions?.length || 0) + 1, date: NY_DAY.format(new Date()) } : undefined);
    const name = `${selected.omo}_${previous ? "REVISED_" : ""}BID_${Math.round(price)}_${selected.address.replace(/[^A-Z0-9]+/gi, "-")}.pdf`;
    const file = new File([bytes as BlobPart], name, { type: "application/pdf" });
    if (filled) URL.revokeObjectURL(filled.url);
    const ready = { omo: selected.omo, price, previous, url: URL.createObjectURL(file), name, file, bytes };
    setFilled(ready);
    return ready;
  }

  async function review() {
    if (!record) return;
    setBusy("Filling the bid package…");
    try {
      await buildPackage(record.price);
      await update(withLog({ ...record, updatedAt: new Date().toISOString() }, `Package filled at ${money2(record.price)}${revisedFrom(record) ? ` (revised from ${money2(revisedFrom(record)!)})` : ""}`));
      setBusy("");
    } catch (err) { setBusy(`Couldn't fill it: ${err instanceof Error ? err.message : String(err)}`); }
  }

  async function send() {
    if (!selected || !record || !filled || filled.price !== record.price) return;
    const again = record.status !== "saved";
    const previous = revisedFrom(record);
    if (previous && filled.previous !== previous) return;
    const ask = previous
      ? `Send the REVISED bid for ${selected.omo} to HPD's bid fax (212) 863-8655?\n\nOld price ${money2(previous)} is crossed out, new price ${money2(record.price)} next to it. The cover says: "Please disregard our previous bid of ${money2(previous)}. Our new bid price is ${money2(record.price)}."`
      : `${again ? "Send again" : "Send"} the bid for ${selected.omo} at ${money2(record.price)} to HPD's bid fax (212) 863-8655?\n\nThis submits your bid.`;
    if (!window.confirm(ask)) return;
    setBusy("Sending the fax…");
    const result = await sendBidFax(selected, record.price, filled.bytes, filled.name, fetch, previous);
    if (!result.ok) { setBusy(`Not sent: ${result.error}`); return; }
    const revisions = previous ? [...(record.revisions || []), { price: previous, sentAt: record.sentAt }] : record.revisions;
    const attempts = (record.attempts || 0) + 1;
    await update(withLog({ ...record, status: "sent", sentAt: result.sentAt, sentPrice: record.price, priorPrice: undefined, revisions, faxTo: result.to, messageId: result.messageId, confirmedAt: undefined, faxNote: undefined, attempts, updatedAt: new Date().toISOString() },
      previous ? `Revised fax sent to HPD: ${money2(previous)} → ${money2(record.price)}` : `Fax sent to HPD at ${money2(record.price)}${attempts > 1 ? ` (send ${attempts})` : ""}`, result.sentAt));
    setRevising(false);
    setBusy("");
  }

  async function markConfirmed() {
    if (!record || !window.confirm(`Mark the fax for ${record.omo} as delivered? Do this when HumbleFax emailed you that it was sent successfully.`)) return;
    const now = new Date().toISOString();
    await update(withLog({ ...record, status: "confirmed", confirmedAt: now, faxNote: "Confirmed by you from HumbleFax's email", updatedAt: now }, "Confirmed by you from HumbleFax's email", now));
    setNote("");
  }

  async function markSentElsewhere() {
    if (!record) return;
    const answer = window.prompt(`What price did HPD get for ${record.omo}? (the bid you already faxed)`);
    const old = Number(String(answer || "").replace(/[^0-9.]/g, ""));
    if (!(old > 0)) return;
    await update({ ...record, priorPrice: old, updatedAt: new Date().toISOString() });
    setFilled(null);
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
    const data = { files: [filled.file], title: filled.name };
    if (navigator.canShare?.(data)) await navigator.share(data).catch(() => {});
    else window.open(filled.url, "_blank");
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
  const todayInfo = todaySummary(list, records, today, nyNow[0] * 60 + nyNow[1], new Date(clock));
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
    if (!window.confirm(`HPD already has your bid for ${selected.omo} at ${money2(has)}.\n\nA revised bid crosses out ${money2(has)}, puts the new price next to it with your initials and the date, and the cover asks HPD to disregard the old price.\n\nRevise this bid?`)) return;
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
      <div className="fc-bids-banner" data-hpd-smoke="fc-bids-banner">
        <strong>📨 Invitations to bid</strong>
        <span>{bids === null ? "Loading…" : error || `${list.length} open to bid · due today or later${list.some((b) => !Number.isFinite(b.lat)) ? ` · ${list.filter((b) => !Number.isFinite(b.lat)).length} without a map spot` : ""}`}{bids ? <small className="fc-bids-read" data-hpd-smoke="fc-bids-today"> · {bids.filter((b) => b.receivedAt && new Date(b.receivedAt).toLocaleDateString("en-US", { timeZone: "America/New_York" }) === new Date().toLocaleDateString("en-US", { timeZone: "America/New_York" })).length} received today</small> : null}{bidsReadAt ? <small className="fc-bids-read" data-hpd-smoke="fc-bids-read"> · emails last checked {new Date(bidsReadAt).toLocaleString("en-US", { timeZone: "America/New_York", weekday: "short", hour: "numeric", minute: "2-digit" })}</small> : null}</span>
        {unread.length ? <p className="fc-bids-unread" role="alert" data-hpd-smoke="fc-bids-unread">⚠️ {unread.length} invitation{unread.length > 1 ? "s" : ""} couldn&apos;t be read, open in your email: {unread.map((u) => `${u.omo || u.file} (${u.why})`).join(", ")}</p> : null}
        <button type="button" data-hpd-smoke="fc-bids-close" onClick={() => { setSelected(null); onClose(); }}>Back to jobs</button>
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
          </header>
          <div className="fc-bid-body">
            <h3>{selected.address}{selected.borough ? ` · ${selected.borough}` : ""}</h3>
            <p className={`fc-bid-due is-${dueWhen(selected).tone}`} data-hpd-smoke="fc-bid-due">⏰ Bid due {dueLabel(selected)} · {dueWhen(selected).text}</p>
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
                  <button type="button" className="fc-bid-confirm" data-hpd-smoke="fc-bid-mark-confirmed" onClick={() => void markConfirmed()}>✓ I got HumbleFax&apos;s confirmation email</button>
                ) : null}
              </div>
            ) : null}
            <section>
              <div className="fc-bid-desc-head">
                <h4>Job description</h4>
                <button type="button" data-hpd-smoke="fc-bid-text-size" aria-label={bigText ? "Smaller text" : "Bigger text"} aria-pressed={bigText} onClick={() => setBigText((v) => { try { localStorage.setItem("hpd-bid-text", v ? "l" : "xl"); } catch {} return !v; })}>{bigText ? "A−" : "A+"}</button>
              </div>
              <p className={`fc-bid-description${bigText ? " is-xl" : ""}`} data-hpd-smoke="fc-bid-description">{selected.description ? readableDescription(selected.description) : "No description on the invitation."}</p>
              {selected.notes ? (
                <>
                  <h4>HPD notes &amp; contacts</h4>
                  <p className={`fc-bid-notes${bigText ? " is-xl" : ""}`} data-hpd-smoke="fc-bid-notes">{selected.notes}</p>
                </>
              ) : null}
              <a className="fc-bid-link" data-hpd-smoke="fc-bid-view" href={`/documents/itb/${encodeURIComponent(selected.itbFile)}`} target="_blank" rel="noreferrer">📄 View the invitation ({selected.pages} pages)</a>
            </section>
            <section className={`fc-bid-price fc-bid-step${step1Done ? " is-done" : ""}`} data-hpd-smoke="fc-step-1">
              <h4>{step1Done ? "✓" : "1"} · Your bid price{step1Done ? ` · saved ${money2(record!.price)}` : ""}</h4>
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
              <input className="fc-bid-reason" disabled={sentLocked} aria-label="Why this price" data-hpd-smoke="fc-bid-reason" placeholder="Why this price? (optional, remembered for jobs like this)" value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} />
              {mineForThis.length ? (
                <div className="fc-bid-mine" data-hpd-smoke="fc-bid-mine">
                  <b>Your price for this work: {money(mineForThis[0].price)}</b>
                  <span>{mineForThis[0].omo} · {mineForThis[0].date ? `${mineForThis[0].date.slice(5, 7)}/${mineForThis[0].date.slice(8, 10)}` : ""} · {mineForThis[0].sent ? "sent to HPD" : "saved"}{mineForThis.length > 1 ? ` · ${mineForThis.length} of your bids on this kind of work: ${mineForThis.slice(0, 4).map((p) => money(p.price)).join(", ")}` : ""}</span>
                  {mineForThis[0].reason ? <span className="fc-bid-mine-reason">“{mineForThis[0].reason}”</span> : null}
                  {draftValue !== mineForThis[0].price ? <button type="button" onClick={() => pickPrice(String(mineForThis[0].price))}>Use {money(mineForThis[0].price)}</button> : <small>Started from your price. The market numbers are below for comparison.</small>}
                </div>
              ) : null}
              <div className="fc-bid-scope" data-hpd-smoke="fc-bid-scope">
                <small>What this job includes (read from the full description):</small>
                <ul>
                  {scope.labels.map((l) => <li key={l}>{l}</li>)}
                  {!scope.labels.length ? <li>general repair</li> : null}
                  {scope.doors ? <li className="is-size">{scope.doors} door{scope.doors > 1 ? "s" : ""}</li> : null}
                  {scope.windows ? <li className="is-size">{scope.windows} window{scope.windows > 1 ? "s" : ""}</li> : null}
                  {scope.repairSqft ? <li className="is-size">~{scope.repairSqft} sq ft repair</li> : null}
                  {scope.paintSqft ? <li className="is-size">~{scope.paintSqft} sq ft paint</li> : null}
                  {scope.tasks > 1 ? <li className="is-size">{scope.tasks} separate tasks</li> : null}
                </ul>
              </div>
              {help ? (
                <div className={`fc-bid-help is-${help.confidence}`} data-hpd-smoke="fc-bid-help">
                  <em data-hpd-smoke="fc-bid-confidence">{help.confidence === "good" ? "Good match" : help.confidence === "fair" ? "Fair match" : "Rough guide: check it"}</em>
                  <b>Winning prices on this kind of work: {money(help.low)}–{money(help.high)} · middle {money(help.middle)}</b>
                  <small data-hpd-smoke="fc-bid-why">{help.why}{help.yours ? ` · ${help.yours} of these ${help.yours === 1 ? "was" : "were"} yours` : ""}.</small>
                  {help.trend ? <small className={`fc-bid-trend ${help.trend.change > 0 ? "is-up" : help.trend.change < 0 ? "is-down" : ""}`} data-hpd-smoke="fc-bid-trend">Last 90 days: middle {money(help.trend.recent)}, {help.trend.change === 0 ? "same as" : `${help.trend.change > 0 ? "up" : "down"} ${Math.abs(help.trend.change)}% from`} {money(help.trend.before)} before.</small> : null}
                  {help.unmatched.length ? <p className="fc-bid-warn" data-hpd-smoke="fc-bid-unmatched">No awarded job with: {help.unmatched.join(", ")}. Add your own price for that part.</p> : null}
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
                  <button type="button" data-hpd-smoke="fc-bid-revise" onClick={() => void startRevision()}>✏️ Revise this bid</button>
                </div>
              ) : (
              <button type="button" className={`fc-bid-fill${step1Done && (reason.trim() || undefined) === record?.reason ? " is-done" : ""}`} data-hpd-smoke="fc-bid-save" disabled={!(draftValue > 0) || (draftValue === record?.price && (reason.trim() || undefined) === record?.reason)} onClick={() => void savePrice()}>
                {record && draftValue === record.price && (reason.trim() || undefined) !== record.reason ? "Save reason" : record && draftValue !== record.price && draftValue > 0 ? `Save new price ${money2(draftValue)}` : step1Done ? `✓ Price saved · ${money2(record!.price)}` : `Save price${draftValue > 0 ? ` ${money2(draftValue)}` : ""}`}
              </button>
              )}
              {revising && record && !revisedFrom(record) ? (
                <div className="fc-bid-locked is-revising" data-hpd-smoke="fc-bid-revising">
                  <b>✏️ Revising · HPD has {money2(record.sentPrice || record.price)}</b>
                  <span>Type the new price and save it, then fill and send the revised package.</span>
                  <button type="button" className="is-plain" data-hpd-smoke="fc-bid-revise-cancel" onClick={() => void cancelRevision()}>Cancel revision</button>
                </div>
              ) : null}
              {record ? <p className="fc-bid-saved" data-hpd-smoke="fc-bid-saved">✓ Price saved: <b>{money2(record.price)}</b> · {when(record.savedAt)}{revisedFrom(record) ? <> · HPD has <s>{money2(revisedFrom(record)!)}</s>: fill and send the <b>revised</b> bid</> : ""}</p> : null}
              {record && record.status === "saved" && !record.priorPrice ? <button type="button" className="fc-bid-link" data-hpd-smoke="fc-bid-sent-elsewhere" onClick={() => void markSentElsewhere()}>Already faxed this bid at a different price?</button> : null}
            </section>
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
                    <button type="button" onClick={() => void share()}>Share</button>
                  </div>
                ) : null}
                <h4 className={step3Done ? `is-done is-${state}` : ""} data-hpd-smoke="fc-step-3">{step3Done ? (state === "confirmed" ? "✓" : state === "failed" ? "✗" : "⏳") : "3"} · Send to HPD{step3Done ? (state === "confirmed" ? ` · fax confirmed ${money2(record.sentPrice || record.price)}` : state === "failed" ? " · fax failed" : ` · fax going through ${money2(record.sentPrice || record.price)}`) : ""}</h4>
                <button type="button" className={`fc-bid-fill is-send${step3Done && state === "confirmed" ? " is-done" : ""}`} data-hpd-smoke="fc-bid-send" disabled={faxLocked || !reviewedSaved || busy === "Sending the fax…"} onClick={() => void send()}>
                  {busy === "Sending the fax…" ? "⏳ Sending the fax…" : revisedFrom(record) ? "📠 Send revised bid to HPD" : state === "saved" ? "📠 Send bid by fax to HPD" : state === "failed" || state === "unconfirmed" ? "📠 Resend bid by fax" : state === "confirmed" ? "✓ Fax confirmed by HumbleFax · locked" : "⏳ Fax going through · send again"}
                </button>
                <small className="fc-bid-note">{reviewedSaved ? "Goes to HPD's bid fax (212) 863-8655 through HumbleFax, with a cover sheet. You'll be asked to confirm." : "Fill and review the package first."}</small>
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
        <aside className={`fc-bids-list${listCollapsed ? " is-collapsed" : ""}`} aria-label="Invitations to bid" data-hpd-smoke="fc-bids-list">
          <button type="button" className="fc-bids-handle" data-hpd-smoke="fc-bids-collapse" onClick={() => setListCollapsed((v) => !v)}>
            {listCollapsed ? `▲ Show the list · ${todayInfo.total ? `${todayInfo.sent} of ${todayInfo.total} due today sent` : `${list.length} open`}` : "▼ Hide the list (see the map)"}
          </button>
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
                const b = badge(records[bid.omo]);
                const ew = stats && !records[bid.omo] ? easyWin(bid.description, stats.workPrices) : null;
                return (
                  <li key={bid.omo}>
                    <button type="button" onClick={() => openBid(bid)}>
                      <span className="fc-bid-row"><b>{bid.omo}</b> <span className={`fc-bid-chip is-${due.tone}`}>{dueLabel(bid)}</span>{b ? <span className={`fc-bid-chip is-${b.tone}`} data-hpd-smoke="fc-bid-badge">{b.text}</span> : null}{ew ? <span className="fc-bid-chip is-easy" data-hpd-smoke="fc-bid-easy-chip">Easy win · ~{money(ew.suggested)}</span> : null}</span>
                      {!records[bid.omo] && !ew && rowHelp.get(bid.omo) ? (() => { const h = rowHelp.get(bid.omo)!; return <span className={`fc-bid-predict is-${h.confidence}`} data-hpd-smoke="fc-bid-predict">Win most ~{money(h.toWin)} · middle {money(h.middle)}{h.confidence === "low" ? " · rough guide" : ""}</span>; })() : null}
                      <span>{bid.address}{bid.borough ? ` · ${bid.borough}` : ""}</span>
                      <small>{due.text}</small>
                    </button>
                  </li>
                );
              })}</ol>
            ) : <p>{list.length ? "No invitations due that day. Pick another day above." : "No open invitations right now. New ones are read through the day (8 AM to 9 PM)."}</p>
          ) : tab === "stats" ? (
            <BidStatsView stats={stats} loading={market === null} jobs={marketJobs} learned={learned} />
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
                    <button type="button" disabled={!openBidData} onClick={() => openBidData && openBid(openBidData)}>
                      <span className="fc-bid-row"><b>{rec.omo}</b> <span className="fc-bid-chip">{money2(rec.sentPrice || rec.price)}</span>
                        {rec.status === "saved" ? <span className="fc-bid-chip is-saved">saved, not sent</span>
                          : <span className={`fc-bid-chip is-${res.result === "won" ? "sent" : res.result === "lost" ? "past" : "later"}`}>{res.result === "won" ? `Won · awarded ${money(res.amount || 0)}` : res.result === "lost" ? (res.winningPrice ? `Lost · won at ${money(res.winningPrice)}` : "Not awarded") : "Awaiting award"}</span>}
                      </span>
                      <span>{rec.address}{rec.borough ? ` · ${rec.borough}` : ""}</span>
                      <small>Due {dueLabel(rec)}{rec.status !== "saved" ? ` · ${FAX_TEXT[fax as keyof typeof FAX_TEXT]}` : ""}{rec.revisions?.length ? ` · revised ${rec.revisions.length}x` : ""}</small>
                      {res.winningPrice && yourPrice > res.winningPrice ? <small className="fc-bid-lost" data-hpd-smoke="fc-bid-lost-by">You bid {money(yourPrice)}: {money(yourPrice - res.winningPrice)} ({Math.round(((yourPrice - res.winningPrice) / res.winningPrice) * 100)}%) above the winning price</small> : null}
                    </button>
                  </li>
                );
              })}</ol>
              {!mine.length ? <p>No bids yet. Save a price on an invitation to start.</p> : null}
            </div>
          )}
        </aside>
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

// HPD writes the description as one long line: start each numbered item ("1)", "2-", "3.") on its own
// line. Every word stays exactly as HPD wrote it.
export function readableDescription(text: string) {
  return text
    .replace(/\s+(?=\d{1,2}\s?\)\s)/g, "\n")
    .replace(/\s+(?=\d{1,2}\s?[-.]\s(?=[A-Za-z]))/g, "\n")
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
