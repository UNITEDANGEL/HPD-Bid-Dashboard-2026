"use client";
// Invitations to bid on the field map: the envelope button flips the map from your jobs to the open
// invitations (due today later than now, or later; from scripts/fetch_upcoming_bids.py). For each:
// read the job and the invitation, save your price (with help from your past winning bids), review
// the filled package (lib/bid-fill.ts) and send it to HPD's bid fax through HumbleFax. The fax is
// checked against HumbleFax's confirmation email and can be resent. "My bids" tracks every bid sent:
// won, not awarded or pending, and your win rate (lib/bid-records.ts).
import { useEffect, useMemo, useRef, useState } from "react";
import { priceHelp, type PricedJob } from "../../lib/bid-price";
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
  const [tab, setTab] = useState<"open" | "mine">("open");
  const [selected, setSelected] = useState<UpcomingBid | null>(null);
  const [records, setRecords] = useState<Record<string, BidRecord>>({});
  const [draft, setDraft] = useState("");
  const [filled, setFilled] = useState<{ omo: string; price: number; url: string; name: string; file: File; bytes: Uint8Array } | null>(null);
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState("");
  const [fullText, setFullText] = useState(false);
  const layerRef = useRef<any>(null);

  useEffect(() => { setRecords(readBidRecords()); }, []);
  useEffect(() => {
    if (!open) return;
    fetch(`${HPD_STATUS_WORKER_URL}/overrides`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (data?.overrides) setRecords((local) => mergeServerBids(local, data.overrides)); })
      .catch(() => {});
    if (bids) return;
    fetch("/data/upcoming_bids.json", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data) => setBids(Array.isArray(data?.bids) ? data.bids.filter((b: UpcomingBid) => stillOpen(b)).sort(byUrgency) : []))
      .catch(() => { setBids([]); setError("Couldn't load the invitations right now."); });
  }, [open, bids]);

  const awarded = useMemo(() => new Map(history.filter((j) => j.amount > 0).map((j) => [j.id, j.amount])), [history]);
  const record = selected ? records[selected.omo] : undefined;

  // Pins: green with a check once a bid is sent. The job pins are hidden while the map shows bids.
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
        return L.marker([bid.lat, bid.lng], {
          pane: "fc-bids", title: `${bid.omo} · ${bid.address} · ${dueLabel(bid)}`,
          icon: L.divIcon({ className: `fc-bid-pin is-${tone}${sent ? " is-sent" : ""}`, html: `<b>${sent ? "✓" : dueLabel(bid).split(" ")[0]}</b>`, iconSize: [34, 34], iconAnchor: [17, 17] }),
          zIndexOffset: 1000 - TONE_ORDER[tone] * 100,
        }).on("click", () => openBid(bid));
      });
      if (!markers.length) return;
      layerRef.current = L.featureGroup(markers).addTo(map);
      map.fitBounds(layerRef.current.getBounds(), { paddingTopLeft: [30, 150], paddingBottomRight: [30, Math.round(window.innerHeight * 0.4)], maxZoom: 14 });
    });
    return () => { cancelled = true; };
  }, [open, bids, map, records]); // eslint-disable-line react-hooks/exhaustive-deps
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

  const help = useMemo(() => (selected ? priceHelp(selected.description, history) : null), [selected, history]);
  const draftValue = Number(String(draft).replace(/[^0-9.]/g, ""));

  async function update(next: BidRecord) {
    setRecords(await saveBidRecord(next, HPD_STATUS_WORKER_URL));
  }

  function openBid(bid: UpcomingBid) {
    setFullText(false);
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
    const bytes = await fillBidPackage(pdf, selected, price);
    const name = `${selected.omo}_BID_${Math.round(price)}_${selected.address.replace(/[^A-Z0-9]+/gi, "-")}.pdf`;
    const file = new File([bytes as BlobPart], name, { type: "application/pdf" });
    if (filled) URL.revokeObjectURL(filled.url);
    const ready = { omo: selected.omo, price, url: URL.createObjectURL(file), name, file, bytes };
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
    if (!window.confirm(`${again ? "Send again" : "Send"} the bid for ${selected.omo} at ${money2(record.price)} to HPD's bid fax (212) 863-8655?\n\nThis submits your bid.`)) return;
    setBusy("Sending the fax…");
    const result = await sendBidFax(selected, record.price, filled.bytes, filled.name);
    if (!result.ok) { setBusy(`Not sent: ${result.error}`); return; }
    await update({ ...record, status: "sent", sentAt: result.sentAt, sentPrice: record.price, faxTo: result.to, messageId: result.messageId, confirmedAt: undefined, faxNote: undefined, attempts: (record.attempts || 0) + 1, updatedAt: new Date().toISOString() });
    setBusy("");
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
  const rate = winRate(mine, awarded, today);
  const sentCount = mine.filter((r) => r.status !== "saved").length;
  const state = record ? faxState(record) : "saved";
  const reviewedSaved = filled && record && filled.omo === record.omo && filled.price === record.price ? filled : null;

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
              <label>
                <span>$</span>
                <input inputMode="decimal" aria-label="Bid price" data-hpd-smoke="fc-bid-price" placeholder="0.00" value={draft} onChange={(e) => setDraft(e.target.value)} />
              </label>
              {help ? (
                <div className="fc-bid-help" data-hpd-smoke="fc-bid-help">
                  <b>Your past winning bids on similar work: {money(help.low)}–{money(help.high)} · middle {money(help.middle)}</b>
                  <small>From {help.count} similar jobs you were awarded. A guide, not a quote.</small>
                  <ul>{help.examples.map((e) => <li key={e.id}><button type="button" onClick={() => setDraft(String(e.amount))}>{e.id} · {money(e.amount)}</button> <span>{e.description}</span></li>)}</ul>
                  <button type="button" className="fc-bid-use" onClick={() => setDraft(String(help.middle))}>Use {money(help.middle)}</button>
                </div>
              ) : <p className="fc-bid-help is-none">No similar past awards to compare with.</p>}
              <button type="button" className="fc-bid-fill" data-hpd-smoke="fc-bid-save" disabled={!(draftValue > 0) || draftValue === record?.price} onClick={() => void savePrice()}>
                {record && draftValue !== record.price && draftValue > 0 ? `Save new price ${money2(draftValue)}` : `Save price${draftValue > 0 ? ` ${money2(draftValue)}` : ""}`}
              </button>
              {record ? <p className="fc-bid-saved" data-hpd-smoke="fc-bid-saved">✓ Price saved: <b>{money2(record.price)}</b> · {when(record.savedAt)}{record.sentPrice && record.sentPrice !== record.price ? ` · HPD has ${money2(record.sentPrice)}: send again to change it` : ""}</p> : null}
            </section>
            {record ? (
              <section className="fc-bid-price">
                <h4>2 · Review the package</h4>
                <button type="button" className="fc-bid-fill is-secondary" data-hpd-smoke="fc-bid-review" disabled={busy === "Filling the bid package…"} onClick={() => void review()}>
                  {reviewedSaved ? "Refill the package" : `Fill the package at ${money2(record.price)}`}
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
                  {state === "saved" ? "📠 Send bid by fax to HPD" : state === "failed" || state === "unconfirmed" ? "📠 Resend bid by fax" : "📠 Send again"}
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
            <button type="button" role="tab" aria-selected={tab === "open"} className={tab === "open" ? "is-active" : ""} onClick={() => setTab("open")}>Open bids ({list.length})</button>
            <button type="button" role="tab" aria-selected={tab === "mine"} className={tab === "mine" ? "is-active" : ""} data-hpd-smoke="fc-bids-mine" onClick={() => setTab("mine")}>My bids ({sentCount})</button>
          </div>
          {tab === "open" ? (
            bids === null ? <p>Loading invitations…</p> : list.length ? (
              <ol>{list.map((bid) => {
                const due = dueWhen(bid);
                const b = badge(records[bid.omo]);
                return (
                  <li key={bid.omo}>
                    <button type="button" onClick={() => openBid(bid)}>
                      <span className="fc-bid-row"><b>{bid.omo}</b> <span className={`fc-bid-chip is-${due.tone}`}>{dueLabel(bid)}</span>{b ? <span className={`fc-bid-chip is-${b.tone}`} data-hpd-smoke="fc-bid-badge">{b.text}</span> : null}</span>
                      <span>{bid.address}{bid.borough ? ` · ${bid.borough}` : ""}</span>
                      <small>{due.text}</small>
                    </button>
                  </li>
                );
              })}</ol>
            ) : <p>No open invitations right now. New ones are read every night.</p>
          ) : (
            <div data-hpd-smoke="fc-my-bids">
              <p className="fc-bid-rate">{rate.decided ? `Won ${rate.won} of ${rate.decided} decided (${rate.percent}%)` : "No results yet"} · {rate.sent} sent{mine.length > sentCount ? ` · ${mine.length - sentCount} saved, not sent` : ""}</p>
              <ol>{mine.map((rec) => {
                const res = bidResult(rec, awarded, today);
                const fax = faxState(rec);
                const openBidData = list.find((b) => b.omo === rec.omo);
                return (
                  <li key={rec.omo}>
                    <button type="button" disabled={!openBidData} onClick={() => openBidData && openBid(openBidData)}>
                      <span className="fc-bid-row"><b>{rec.omo}</b> <span className="fc-bid-chip">{money2(rec.sentPrice || rec.price)}</span>
                        {rec.status === "saved" ? <span className="fc-bid-chip is-saved">saved, not sent</span>
                          : <span className={`fc-bid-chip is-${res.result === "won" ? "sent" : res.result === "lost" ? "past" : "later"}`}>{res.result === "won" ? `Won · awarded ${money(res.amount || 0)}` : res.result === "lost" ? "Not awarded" : "Pending"}</span>}
                      </span>
                      <span>{rec.address}{rec.borough ? ` · ${rec.borough}` : ""}</span>
                      <small>Due {dueLabel(rec)}{rec.status !== "saved" ? ` · ${FAX_TEXT[fax as keyof typeof FAX_TEXT]}` : ""}</small>
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
