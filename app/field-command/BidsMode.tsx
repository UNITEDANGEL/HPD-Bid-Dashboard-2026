"use client";
// Invitations to bid on the field map: the envelope button flips the map from your jobs to the
// upcoming bids (not awarded yet, from scripts/fetch_upcoming_bids.py). Tap one to read the job, see
// the invitation, get price help from your past winning bids, and fill the whole bid package with
// one price (lib/bid-fill.ts). Prices typed here stay on this phone.
import { useEffect, useMemo, useRef, useState } from "react";
import { priceHelp, type PricedJob } from "../../lib/bid-price";
import type { UpcomingBid } from "../../lib/bid-fill";
import "./bids.css";

const PRICES_KEY = "hpd-bid-prices-v1";
const NY_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" });
const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

function dueLabel(bid: UpcomingBid) {
  const [y, m, d] = bid.bidDue.split("-").map(Number);
  const weekday = new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
  return `${weekday} ${m}/${d}${bid.bidDueTime ? ` · ${bid.bidDueTime}` : ""}`;
}

function dueWhen(bid: UpcomingBid) {
  const today = NY_DAY.format(new Date());
  const days = Math.round((Date.parse(bid.bidDue) - Date.parse(today)) / 86400000);
  if (days < 0) return { text: `due ${-days} day${days === -1 ? "" : "s"} ago · award pending`, tone: "past" };
  if (days === 0) return { text: "due today", tone: "today" };
  if (days === 1) return { text: "due tomorrow", tone: "soon" };
  return { text: `due in ${days} days`, tone: "later" };
}

// Due today first, then tomorrow and later (soonest first); bids already due (award pending) last.
const TONE_ORDER: Record<string, number> = { today: 0, soon: 1, later: 2, past: 3 };
function byUrgency(a: UpcomingBid, b: UpcomingBid) {
  const ta = TONE_ORDER[dueWhen(a).tone], tb = TONE_ORDER[dueWhen(b).tone];
  if (ta !== tb) return ta - tb;
  const key = (x: UpcomingBid) => `${x.bidDue} ${x.bidDueTime.replace(/^(\d):/, "0$1:")}`;
  return ta === 3 ? key(b).localeCompare(key(a)) : key(a).localeCompare(key(b));
}

function readPrices(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(PRICES_KEY) || "{}"); } catch { return {}; }
}

export default function BidsMode({ open, map, history, onClose }: { open: boolean; map: any; history: PricedJob[]; onClose: () => void }) {
  const [bids, setBids] = useState<UpcomingBid[] | null>(null);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<UpcomingBid | null>(null);
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [filled, setFilled] = useState<{ omo: string; url: string; name: string; file: File } | null>(null);
  const [busy, setBusy] = useState("");
  const [fullText, setFullText] = useState(false);
  const layerRef = useRef<any>(null);

  useEffect(() => { setPrices(readPrices()); }, []);
  useEffect(() => {
    if (!open || bids) return;
    fetch("/data/upcoming_bids.json", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data) => setBids(Array.isArray(data?.bids) ? [...data.bids].sort(byUrgency) : []))
      .catch(() => { setBids([]); setError("Couldn't load the invitations right now."); });
  }, [open, bids]);

  // Pins: the job pins are hidden while the map shows bids.
  useEffect(() => {
    if (!map) return;
    const container = map.getContainer?.();
    container?.classList.toggle("is-bids", open);
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
        const when = dueWhen(bid);
        return L.marker([bid.lat, bid.lng], {
          pane: "fc-bids",
          title: `${bid.omo} · ${bid.address} · ${dueLabel(bid)}`,
          icon: when.tone === "past"
            ? L.divIcon({ className: "fc-bid-pin is-past", html: "", iconSize: [14, 14], iconAnchor: [7, 7] })
            : L.divIcon({ className: `fc-bid-pin is-${when.tone}`, html: `<b>${dueLabel(bid).split(" ")[0]}</b>`, iconSize: [34, 34], iconAnchor: [17, 17] }),
          zIndexOffset: when.tone === "past" ? 0 : 1000 - TONE_ORDER[when.tone] * 100,
        }).on("click", () => { setFullText(false); setSelected(bid); });
      });
      if (!markers.length) return;
      layerRef.current = L.featureGroup(markers).addTo(map);
      map.fitBounds(layerRef.current.getBounds(), { paddingTopLeft: [30, 150], paddingBottomRight: [30, Math.round(window.innerHeight * 0.4)], maxZoom: 14 });
    });
    return () => { cancelled = true; };
  }, [open, bids, map]);
  useEffect(() => () => { layerRef.current?.remove(); map?.getContainer?.()?.classList.remove("is-bids"); }, [map]);

  const help = useMemo(() => (selected ? priceHelp(selected.description, history) : null), [selected, history]);
  const price = selected ? prices[selected.omo] || "" : "";
  const priceValue = Number(String(price).replace(/[^0-9.]/g, ""));

  function setPrice(value: string) {
    if (!selected) return;
    const next = { ...prices, [selected.omo]: value };
    setPrices(next);
    try { localStorage.setItem(PRICES_KEY, JSON.stringify(next)); } catch { /* still in memory */ }
    if (filled?.omo === selected.omo) setFilled(null);
  }

  async function fill() {
    if (!selected || !(priceValue > 0)) return;
    setBusy("Filling the bid package…");
    try {
      const [{ fillBidPackage }, pdf] = await Promise.all([
        import("../../lib/bid-fill"),
        fetch(`/documents/itb/${encodeURIComponent(selected.itbFile)}`).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`invitation PDF: HTTP ${r.status}`)))),
      ]);
      const bytes = await fillBidPackage(pdf, selected, priceValue);
      const name = `${selected.omo}_BID_${Math.round(priceValue)}_${selected.address.replace(/[^A-Z0-9]+/gi, "-")}.pdf`;
      const file = new File([bytes as BlobPart], name, { type: "application/pdf" });
      if (filled) URL.revokeObjectURL(filled.url);
      setFilled({ omo: selected.omo, url: URL.createObjectURL(file), name, file });
      setBusy("");
    } catch (err) {
      setBusy(`Couldn't fill it: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async function share() {
    if (!filled) return;
    const data = { files: [filled.file], title: filled.name };
    if (navigator.canShare?.(data)) await navigator.share(data).catch(() => {});
    else window.open(filled.url, "_blank");
  }

  if (!open) return null;
  const list = bids || [];
  return (
    <>
      <div className="fc-bids-banner" data-hpd-smoke="fc-bids-banner">
        <strong>📨 Invitations to bid</strong>
        <span>{bids === null ? "Loading…" : error || `${list.length} not awarded yet${list.some((b) => !Number.isFinite(b.lat)) ? ` · ${list.filter((b) => !Number.isFinite(b.lat)).length} without a map spot` : ""}`}</span>
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
            <section>
              <h4>Job description</h4>
              <p className={`fc-bid-description${fullText ? "" : " is-short"}`} data-hpd-smoke="fc-bid-description">{selected.description || "No description on the invitation."}</p>
              {selected.description.length > 360 ? <button type="button" className="fc-bid-more" onClick={() => setFullText((v) => !v)}>{fullText ? "Show less" : "Show all"}</button> : null}
              <a className="fc-bid-link" data-hpd-smoke="fc-bid-view" href={`/documents/itb/${encodeURIComponent(selected.itbFile)}`} target="_blank" rel="noreferrer">📄 View the invitation ({selected.pages} pages)</a>
            </section>
            <section className="fc-bid-price">
              <h4>Your bid price</h4>
              <label>
                <span>$</span>
                <input inputMode="decimal" aria-label="Bid price" data-hpd-smoke="fc-bid-price" placeholder="0.00" value={price} onChange={(e) => setPrice(e.target.value)} />
              </label>
              {help ? (
                <div className="fc-bid-help" data-hpd-smoke="fc-bid-help">
                  <b>Your past winning bids on similar work: {money(help.low)}–{money(help.high)} · middle {money(help.middle)}</b>
                  <small>From {help.count} similar jobs you were awarded. A guide, not a quote.</small>
                  <ul>{help.examples.map((e) => <li key={e.id}><button type="button" onClick={() => setPrice(String(e.amount))}>{e.id} · {money(e.amount)}</button> <span>{e.description}</span></li>)}</ul>
                  <button type="button" className="fc-bid-use" onClick={() => setPrice(String(help.middle))}>Use {money(help.middle)}</button>
                </div>
              ) : <p className="fc-bid-help is-none">No similar past awards to compare with.</p>}
              <button type="button" className="fc-bid-fill" data-hpd-smoke="fc-bid-fill" disabled={!(priceValue > 0) || busy === "Filling the bid package…"} onClick={() => void fill()}>
                Fill bid package{priceValue > 0 ? ` · $${priceValue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : ""}
              </button>
              <small className="fc-bid-note">Writes the price on page 1, page 2 and the Work Description Form, plus your company details, signatures, date and the work description, like the bid filler.</small>
              {busy ? <p role="status">{busy}</p> : null}
              {filled?.omo === selected.omo ? (
                <div className="fc-bid-done" data-hpd-smoke="fc-bid-done">
                  <b>✓ Bid package ready</b>
                  <a href={filled.url} target="_blank" rel="noreferrer" data-hpd-smoke="fc-bid-open">Open</a>
                  <a href={filled.url} download={filled.name}>Save</a>
                  <button type="button" onClick={() => void share()}>Share</button>
                </div>
              ) : null}
            </section>
          </div>
        </div>
      ) : (
        <aside className="fc-bids-list" aria-label="Invitations to bid" data-hpd-smoke="fc-bids-list">
          {bids === null ? <p>Loading invitations…</p> : list.length ? (
            <ol>{list.map((bid) => {
              const when = dueWhen(bid);
              return (
                <li key={bid.omo}>
                  <button type="button" onClick={() => { setFullText(false); setSelected(bid); }}>
                    <span className="fc-bid-row"><b>{bid.omo}</b> <span className={`fc-bid-chip is-${when.tone}`}>{dueLabel(bid)}</span></span>
                    <span>{bid.address}{bid.borough ? ` · ${bid.borough}` : ""}</span>
                    <small>{when.text}{prices[bid.omo] ? ` · your price $${prices[bid.omo]}` : ""}</small>
                  </button>
                </li>
              );
            })}</ol>
          ) : <p>No open invitations right now. New ones are read every night.</p>}
        </aside>
      )}
    </>
  );
}
