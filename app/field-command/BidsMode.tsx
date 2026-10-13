"use client";
// Invitations to bid on the field map: the envelope button flips the map from your jobs to the open
// invitations (due today later than now, or later; from scripts/fetch_upcoming_bids.py). For each:
// read the job and the invitation, save your price (with help from your past winning bids), review
// the filled package (lib/bid-fill.ts) and send it to HPD's bid fax through HumbleFax. The fax is
// checked against HumbleFax's confirmation email and can be resent. "My bids" tracks every bid sent:
// won, not awarded or pending, and your win rate (lib/bid-records.ts).
import { useEffect, useMemo, useRef, useState } from "react";
import { priceHelp, readScope, winChance, type PricedJob } from "../../lib/bid-price";
import { beats, bidStats, easyWin, historyRows, filterHistory, type Group, type HistoryFilter, type MarketJob, type WorkPrice } from "../../lib/bid-stats";
import type { UpcomingBid } from "../../lib/bid-fill";
import { HPD_STATUS_WORKER_URL } from "../../lib/paperwork";
import { bidResult, checkBidFax, faxState, mergeServerBids, readBidRecords, saveBidRecord, sendBidFax, winRate, type BidRecord } from "../../lib/bid-records";
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
  confirmed: "✓ Fax confirmed by HumbleFax", failed: "✗ Fax failed", unconfirmed: "⚠ No confirmation from HumbleFax yet",
} as const;

function badge(record?: BidRecord) {
  if (!record) return null;
  const state = faxState(record);
  if (state === "saved") return { text: `${money(record.price)} saved`, tone: "saved" };
  if (state === "failed" || state === "unconfirmed") return { text: `Resend · ${money(record.sentPrice || record.price)}`, tone: "failed" };
  return { text: `✓ Sent ${money(record.sentPrice || record.price)}`, tone: "sent" };
}

export default function BidsMode({ open, map, history, onClose }: { open: boolean; map: any; history: PricedJob[]; onClose: () => void }) {
  const [bids, setBids] = useState<UpcomingBid[] | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"open" | "mine" | "stats" | "history">("open");
  const [selected, setSelected] = useState<UpcomingBid | null>(null);
  const [records, setRecords] = useState<Record<string, BidRecord>>({});
  const [draft, setDraft] = useState("");
  const [filled, setFilled] = useState<{ omo: string; price: number; previous?: number; url: string; name: string; file: File; bytes: Uint8Array } | null>(null);
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState("");
  const [fullText, setFullText] = useState(false);
  const [showSimilar, setShowSimilar] = useState(false);
  const [market, setMarket] = useState<PricedJob[] | null>(null);
  const [marketJobs, setMarketJobs] = useState<MarketJob[]>([]);
  const layerRef = useRef<any>(null);

  useEffect(() => { setRecords(readBidRecords()); }, []);
  useEffect(() => {
    if (!open) return;
    fetch(`${HPD_STATUS_WORKER_URL}/overrides`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (data?.overrides) setRecords((local) => mergeServerBids(local, data.overrides)); })
      .catch(() => {});
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
      .then((data) => setBids(Array.isArray(data?.bids) ? data.bids.filter((b: UpcomingBid) => stillOpen(b)).sort(byUrgency) : []))
      .catch(() => { setBids([]); setError("Couldn't load the invitations right now."); });
  }, [open, bids]); // eslint-disable-line react-hooks/exhaustive-deps

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
  // Open invitations that are easy wins (work you win well under what other winners get).
  const easyOmos = useMemo(() => new Set((bids || []).filter((b) => stats && easyWin(b.description, stats.workPrices)).map((b) => b.omo)), [bids, stats]);

  // Pins: green with a check once a bid is sent; a green ring and $ for an easy win. The job pins are hidden while the map shows bids.
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
      const markers = bids.filter((b) => Number.isFinite(b.lat) && Number.isFinite(b.lng)).map((bid) => {
        const tone = dueWhen(bid).tone;
        const sent = badge(records[bid.omo])?.tone === "sent";
        const easyPin = !sent && !records[bid.omo] && easyOmos.has(bid.omo);
        return L.marker([bid.lat, bid.lng], {
          pane: "fc-bids", title: `${bid.omo} · ${bid.address} · ${dueLabel(bid)}${easyPin ? " · Easy win" : ""}`,
          icon: L.divIcon({ className: `fc-bid-pin is-${tone}${sent ? " is-sent" : ""}${easyPin ? " is-easy" : ""}`, html: `<b>${sent ? "✓" : dueLabel(bid).split(" ")[0]}</b>${easyPin ? "<i>$</i>" : ""}`, iconSize: [34, 34], iconAnchor: [17, 17] }),
          zIndexOffset: 1000 - TONE_ORDER[tone] * 100,
        }).on("click", () => openBid(bid));
      });
      if (!markers.length) return;
      layerRef.current = L.featureGroup(markers).addTo(map);
      map.fitBounds(layerRef.current.getBounds(), { paddingTopLeft: [30, 150], paddingBottomRight: [30, Math.round(window.innerHeight * 0.4)], maxZoom: 14 });
    });
    return () => { cancelled = true; };
  }, [open, bids, map, records, easyOmos]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { layerRef.current?.remove(); map?.getContainer?.()?.classList.remove("is-bids"); }, [map]);

  // After a fax goes out: ask Gmail for HumbleFax's confirmation now and every minute while waiting.
  useEffect(() => {
    if (!record || faxState(record) !== "waiting" || !record.sentAt) return;
    let stopped = false;
    const check = async () => {
      const result = await checkBidFax(record.omo, record.sentAt!);
      if (stopped) return;
      if (result.status === "confirmed" || result.status === "failed") {
        await update({ ...record, status: result.status, confirmedAt: result.at, faxNote: result.subject, updatedAt: new Date().toISOString() });
      } else if (result.status === "unknown") {
        setNote(result.error || "");
      }
    };
    void check();
    const timer = window.setInterval(check, 60000);
    return () => { stopped = true; window.clearInterval(timer); };
  }, [record?.omo, record?.sentAt, record?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const help = useMemo(() => (selected ? priceHelp(selected.description, pricing) : null), [selected, pricing]);
  const scope = useMemo(() => readScope(selected?.description || ""), [selected]);
  const easy = useMemo(() => (selected && stats ? easyWin(selected.description, stats.workPrices) : null), [selected, stats]);
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
    setDraft(records[bid.omo] ? String(records[bid.omo].price) : "");
  }

  async function savePrice() {
    if (!selected || !(draftValue > 0)) return;
    const now = new Date().toISOString();
    const previous = records[selected.omo];
    await update({
      ...(previous || { attempts: 0 }), omo: selected.omo, address: selected.address, borough: selected.borough,
      bidDue: selected.bidDue, bidDueTime: selected.bidDueTime, price: draftValue, savedAt: now,
      status: previous && previous.status !== "saved" ? previous.status : "saved", updatedAt: now,
    } as BidRecord);
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
    try { await buildPackage(record.price); setBusy(""); } catch (err) { setBusy(`Couldn't fill it: ${err instanceof Error ? err.message : String(err)}`); }
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
    await update({ ...record, status: "sent", sentAt: result.sentAt, sentPrice: record.price, priorPrice: undefined, revisions, faxTo: result.to, messageId: result.messageId, confirmedAt: undefined, faxNote: undefined, attempts: (record.attempts || 0) + 1, updatedAt: new Date().toISOString() });
    setBusy("");
  }

  async function markConfirmed() {
    if (!record || !window.confirm(`Mark the fax for ${record.omo} as delivered? Do this when HumbleFax emailed you that it was sent successfully.`)) return;
    const now = new Date().toISOString();
    await update({ ...record, status: "confirmed", confirmedAt: now, faxNote: "Confirmed by you from HumbleFax's email", updatedAt: now });
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

  return (
    <>
      <div className="fc-bids-banner" data-hpd-smoke="fc-bids-banner">
        <strong>📨 Invitations to bid</strong>
        <span>{bids === null ? "Loading…" : error || `${list.length} open to bid · due today or later${list.some((b) => !Number.isFinite(b.lat)) ? ` · ${list.filter((b) => !Number.isFinite(b.lat)).length} without a map spot` : ""}`}</span>
        <button type="button" data-hpd-smoke="fc-bids-close" onClick={() => { setSelected(null); onClose(); }}>Back to jobs</button>
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
                {state === "waiting" || state === "unconfirmed" ? (
                  <button type="button" className="fc-bid-confirm" data-hpd-smoke="fc-bid-mark-confirmed" onClick={() => void markConfirmed()}>✓ I got HumbleFax&apos;s confirmation email</button>
                ) : null}
              </div>
            ) : null}
            <section>
              <h4>Job description</h4>
              <p className={`fc-bid-description${fullText ? "" : " is-short"}`} data-hpd-smoke="fc-bid-description">{selected.description || "No description on the invitation."}</p>
              {selected.description.length > 360 ? <button type="button" className="fc-bid-more" onClick={() => setFullText((v) => !v)}>{fullText ? "Show less" : "Show all"}</button> : null}
              <a className="fc-bid-link" data-hpd-smoke="fc-bid-view" href={`/documents/itb/${encodeURIComponent(selected.itbFile)}`} target="_blank" rel="noreferrer">📄 View the invitation ({selected.pages} pages)</a>
            </section>
            <section className="fc-bid-price">
              <h4>1 · Your bid price</h4>
              {easy ? (
                <div className="fc-bid-easy" data-hpd-smoke="fc-bid-easy">
                  <b>Easy win: bid this one · ~{money(easy.suggested)}</b>
                  <span>{easy.label}: you usually win it at {money(easy.yours)} ({easy.yoursN} of your wins). Other contractors won it at {money(easy.others)} ({easy.othersN} jobs, last 12 months). At {money(easy.suggested)} you would have beaten {easy.beatsN} of those {easy.of} winners.</span>
                  <button type="button" onClick={() => setDraft(String(easy.suggested))}>Use {money(easy.suggested)}</button>
                </div>
              ) : null}
              <label>
                <span>$</span>
                <input inputMode="decimal" aria-label="Bid price" data-hpd-smoke="fc-bid-price" placeholder="0.00" value={draft} onChange={(e) => setDraft(e.target.value)} />
              </label>
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
                      <button type="button" key={t.label} onClick={() => setDraft(String(t.price))}>
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
              <button type="button" className="fc-bid-fill" data-hpd-smoke="fc-bid-save" disabled={!(draftValue > 0) || draftValue === record?.price} onClick={() => void savePrice()}>
                {record && draftValue !== record.price && draftValue > 0 ? `Save new price ${money2(draftValue)}` : `Save price${draftValue > 0 ? ` ${money2(draftValue)}` : ""}`}
              </button>
              {record ? <p className="fc-bid-saved" data-hpd-smoke="fc-bid-saved">✓ Price saved: <b>{money2(record.price)}</b> · {when(record.savedAt)}{revisedFrom(record) ? <> · HPD has <s>{money2(revisedFrom(record)!)}</s>: fill and send the <b>revised</b> bid</> : ""}</p> : null}
              {record && record.status === "saved" && !record.priorPrice ? <button type="button" className="fc-bid-link" data-hpd-smoke="fc-bid-sent-elsewhere" onClick={() => void markSentElsewhere()}>Already faxed this bid at a different price?</button> : null}
            </section>
            {record ? (
              <section className="fc-bid-price">
                <h4>2 · Review the package</h4>
                <button type="button" className="fc-bid-fill is-secondary" data-hpd-smoke="fc-bid-review" disabled={busy === "Filling the bid package…"} onClick={() => void review()}>
                  {reviewedSaved ? "Refill the package" : revisedFrom(record) ? `Fill the revised package: ${money2(revisedFrom(record)!)} → ${money2(record.price)}` : `Fill the package at ${money2(record.price)}`}
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
                <h4>3 · Send to HPD</h4>
                <button type="button" className="fc-bid-fill is-send" data-hpd-smoke="fc-bid-send" disabled={!reviewedSaved || busy === "Sending the fax…"} onClick={() => void send()}>
                  {revisedFrom(record) ? "📠 Send revised bid to HPD" : state === "saved" ? "📠 Send bid by fax to HPD" : state === "failed" || state === "unconfirmed" ? "📠 Resend bid by fax" : "📠 Send again"}
                </button>
                <small className="fc-bid-note">{reviewedSaved ? "Goes to HPD's bid fax (212) 863-8655 through HumbleFax, with a cover sheet. You'll be asked to confirm." : "Fill and review the package first."}</small>
              </section>
            ) : null}
            {busy ? <p role="status" className="fc-bid-busy">{busy}</p> : null}
          </div>
        </div>
      ) : (
        <aside className="fc-bids-list" aria-label="Invitations to bid" data-hpd-smoke="fc-bids-list">
          <div className="fc-bid-tabs" role="tablist">
            <button type="button" role="tab" aria-selected={tab === "open"} className={tab === "open" ? "is-active" : ""} onClick={() => setTab("open")}>Open ({list.length})</button>
            <button type="button" role="tab" aria-selected={tab === "mine"} className={tab === "mine" ? "is-active" : ""} data-hpd-smoke="fc-bids-mine" onClick={() => setTab("mine")}>Mine ({sentCount})</button>
            <button type="button" role="tab" aria-selected={tab === "stats"} className={tab === "stats" ? "is-active" : ""} data-hpd-smoke="fc-bids-stats" onClick={() => setTab("stats")}>Stats</button>
            <button type="button" role="tab" aria-selected={tab === "history"} className={tab === "history" ? "is-active" : ""} data-hpd-smoke="fc-bids-history" onClick={() => setTab("history")}>History</button>
          </div>
          {tab === "open" ? (
            bids === null ? <p>Loading invitations…</p> : list.length ? (
              <ol>{list.map((bid) => {
                const due = dueWhen(bid);
                const b = badge(records[bid.omo]);
                const ew = stats && !records[bid.omo] ? easyWin(bid.description, stats.workPrices) : null;
                return (
                  <li key={bid.omo}>
                    <button type="button" onClick={() => openBid(bid)}>
                      <span className="fc-bid-row"><b>{bid.omo}</b> <span className={`fc-bid-chip is-${due.tone}`}>{dueLabel(bid)}</span>{b ? <span className={`fc-bid-chip is-${b.tone}`} data-hpd-smoke="fc-bid-badge">{b.text}</span> : null}{ew ? <span className="fc-bid-chip is-easy" data-hpd-smoke="fc-bid-easy-chip">Easy win · ~{money(ew.suggested)}</span> : null}</span>
                      <span>{bid.address}{bid.borough ? ` · ${bid.borough}` : ""}</span>
                      <small>{due.text}</small>
                    </button>
                  </li>
                );
              })}</ol>
            ) : <p>No open invitations right now. New ones are read every night.</p>
          ) : tab === "stats" ? (
            <BidStatsView stats={stats} loading={market === null} />
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
function BidStatsView({ stats, loading }: { stats: ReturnType<typeof bidStats> | null; loading: boolean }) {
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
      <ShouldHaveBid stats={stats} />
      <PriceList rows={stats.priceList} />
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
function PriceList({ rows }: { rows: WorkPrice[] }) {
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
            <tr key={p.key} className={p.suggested > p.yours ? "is-raise" : ""}>
              <th>{p.label}</th>
              <td>{money(p.yours)}<small>{p.yoursN} wins</small></td>
              <td>{money(p.others)}<small>{p.othersN} jobs</small></td>
              <td><b>{money(p.suggested)}</b><small>beats {b.n}/{b.of}</small></td>
            </tr>
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
