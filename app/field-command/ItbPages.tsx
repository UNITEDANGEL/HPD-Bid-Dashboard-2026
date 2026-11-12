"use client";

// The invitation's own job-description pages (2 and 3 of HPD's PDF) as pictures in the bid card, so the
// wording, tables and sketches read exactly as HPD wrote them. Tap a page to open it full screen
// (pinch to zoom); "All pages" shows the whole invitation.
import { useEffect, useRef, useState } from "react";
import { getPages, prunePages, putPages } from "../../lib/page-cache";
import { usePinchZoom } from "../../lib/use-pinch-zoom";
import { canReadAloud, readAloud, stopReading } from "../../lib/read-aloud";

type Rendered = { page: number; url: string };

async function drawPages(pdfUrl: string, pages: number[]): Promise<{ page: number; blob: Blob }[]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url).toString();
  const res = await fetch(pdfUrl);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const task = pdfjs.getDocument({ data: new Uint8Array(await res.arrayBuffer()), stopAtErrors: false });
  const doc = await task.promise;
  const out: { page: number; blob: Blob }[] = [];
  try {
    for (const n of pages.filter((p) => p >= 1 && p <= doc.numPages)) {
      const page = await doc.getPage(n);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: Math.max(1, Math.min(2.4, 1300 / base.width)) });
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("no canvas");
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      await page.render({ canvas, canvasContext: ctx, viewport }).promise;
      const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/jpeg", 0.88));
      if (blob) out.push({ page: n, blob });
    }
    return out;
  } finally {
    await task.destroy();
  }
}

// Pages already drawn come from the phone (lib/page-cache); only the missing ones are drawn (and kept).
// The PDF is only downloaded when a page is missing.
export async function pagePictures(pdfUrl: string, pages: number[]): Promise<{ page: number; blob: Blob }[]> {
  void prunePages();
  const kept = await getPages(pdfUrl, pages);
  const missing = pages.filter((p) => !kept.has(p));
  let drawn: { page: number; blob: Blob }[] = [];
  if (missing.length) {
    drawn = await drawPages(pdfUrl, missing);
    void putPages(pdfUrl, drawn);
  }
  const all = new Map<number, Blob>([...kept, ...drawn.map((d) => [d.page, d.blob] as [number, Blob])]);
  return pages.filter((p) => all.has(p)).map((p) => ({ page: p, blob: all.get(p)! }));
}

async function renderPages(pdfUrl: string, pages: number[]) {
  const pics = await pagePictures(pdfUrl, pages);
  return { pages: pics.map((p) => ({ page: p.page, url: URL.createObjectURL(p.blob) })) as Rendered[] };
}

// The pages a bid card shows: HPD's form (page 2) and every page the job description is on (3, 4+).
export const bidPages = (pageCount: number, descPages?: number[]) => [...new Set([2, ...(descPages?.length ? descPages : [3])])].filter((p) => p <= pageCount).sort((a, b) => a - b);

// Where HPD types the work on a page, as a part of its height: page 3's "Job Description:" near the top; on the order
// form (page 2, when page 3 is empty: ER09499) the "WORK DESCRIPTION" box a little past the middle.
const workAt = (page: number) => (page === 2 ? 0.56 : 0.12);
// Where the work ends on page 3 (owner, 6 Nov: "slow down the scrolling on the work description page and stay on the
// work description, you don't need to go down"): the "Job Description:" box starts about 22% down, each typed line is
// about 2% of the page, ~72 letters a line; HPD's standard notes come after it. Not known: the first half of the page.
export const workEndAt = (descChars?: number) => (descChars && descChars > 0 ? Math.min(0.7, 0.22 + (Math.ceil(descChars / 72) + 3) * 0.0195) : 0.45);

// Read along (owner, 5 Nov: "scroll it slowly left and right, read the whole description, like I'm scrolling it"): the
// zoomed page pans slowly across each part of the work, then down to the next, to the end of the description. Any
// touch hands it back to you.
// Owner, 9 Nov: "zoom out a little so I can see it better, slow down the scrolling, it goes right to the edge": a
// wider view (1.7x, not 2x), slower pans that stop a moment at each end and keep the page's margin in view, and
// 🐢 / 🐇 to set your own speed (kept on this phone).
export const READ_ZOOM = 1.7;
const readSpeed = { x: (() => { try { return Number(localStorage.getItem("hpd-read-speed")) || 1; } catch { return 1; } })() };
function setReadSpeed(x: number) {
  readSpeed.x = Math.max(0.4, Math.min(3, Math.round(x * 100) / 100));
  try { localStorage.setItem("hpd-read-speed", String(readSpeed.x)); } catch {}
  return readSpeed.x;
}
function readAlongPage(el: HTMLElement, startAt: number, endAt: number, onDone: () => void) {
  const fast = (() => { try { return navigator.webdriver ? 0.12 : 1; } catch { return 1; } })();
  const pace = () => fast * readSpeed.x; // read at every pan, so 🐢 / 🐇 work while it reads
  let stop = false;
  const off = () => { stop = true; };
  el.addEventListener("pointerdown", off, { once: true });
  el.addEventListener("wheel", off, { once: true, passive: true });
  el.addEventListener("touchstart", off, { once: true, passive: true });
  const ease = (x: number) => (x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2);
  const hold = (ms: number) => new Promise<void>((done) => window.setTimeout(done, ms * pace()));
  const glide = (toLeft: number, toTop: number, ms: number) => new Promise<void>((done) => {
    ms *= pace();
    const fromL = el.scrollLeft, fromT = el.scrollTop, t0 = performance.now();
    const tick = (now: number) => {
      if (stop) return done();
      const p = Math.min(1, (now - t0) / Math.max(1, ms));
      el.scrollLeft = fromL + (toLeft - fromL) * ease(p);
      el.scrollTop = fromT + (toTop - fromT) * ease(p);
      if (p < 1) requestAnimationFrame(tick); else done();
    };
    requestAnimationFrame(tick);
  });
  void (async () => {
    // The ends of each line with the page's white margin beside them, so no word sits on the screen's edge.
    const left = Math.max(0, el.scrollWidth * 0.02);
    const right = Math.max(left, el.scrollWidth - el.clientWidth);
    const end = Math.min(el.scrollHeight - el.clientHeight, el.scrollHeight * endAt);
    let top = el.scrollHeight * startAt;
    await hold(1200);                                  // a moment to find the start
    for (let row = 0; row < 10 && !stop; row += 1) {
      await glide(right, top, 9000);                   // across the lines, left to right (slower: 6 and 9 Nov)
      if (stop) break;
      await hold(1000);                                // stop at the end of the line
      if (stop || top >= end) break;
      top = Math.min(end, top + el.clientHeight * 0.25);
      await glide(left, top, 2600);                    // back to the left, a little further down
      if (stop) break;
      await hold(800);
    }
    // Back up to the start of the work and stay there (it doesn't wander into HPD's standard notes).
    if (!stop) await glide(left, el.scrollHeight * startAt, 2400);
    el.removeEventListener("pointerdown", off);
    el.removeEventListener("wheel", off);
    el.removeEventListener("touchstart", off);
    onDone();
  })();
  return off;
}

export default function ItbPages({ pdfUrl, pageCount, descPages, everyPage, title, showDescription = 0, readAlong = false, onPrice, descChars, readAll, readSummary }: { pdfUrl: string; pageCount: number; descPages?: number[]; everyPage?: boolean; title?: string; showDescription?: number; readAlong?: boolean; onPrice?: () => void; descChars?: number; readAll?: string; readSummary?: string[] }) {
  // HPD's form (page 2) and every page the job description is on (3, and 4+ when a long job continues).
  const descriptionPages = bidPages(pageCount, descPages);
  const [shown, setShown] = useState<Rendered[] | null>(null);
  // The whole invitation by default (owner, 16 Oct: other pages can have more information); the button shows
  // only the job-description pages.
  const [all, setAll] = useState(true);
  const [error, setError] = useState("");
  const [big, setBig] = useState<Rendered | null>(null);
  const urls = useRef<string[]>([]);
  const { zoom, zoomTo, bind } = usePinchZoom();
  // showDescription changes (a bid was just opened): the job description page opens full screen, zoomed in on the work.
  const [wantDesc, setWantDesc] = useState(0);
  const autoZoom = useRef<number | null>(null);
  // "reading" while the page pans by itself; "read" once it reached the end (the price button glows).
  const [reading, setReading] = useState<"" | "reading" | "read">("");
  const stopRead = useRef<() => void>(() => {});
  const [speed, setSpeed] = useState(1);
  // 🔊 Read it to me (idea "Read the bid out loud"; owner, 9 Nov: "an option for a readout and a summary option"): the
  // phone's own voice reads HPD's whole work description, or a short summary (also shown on the page). The one you pick
  // is used for every work description you open after (kept on this phone); Stop turns it off.
  type Voice = "" | "all" | "summary";
  const [voice, setVoice] = useState<Voice>("");
  const [speaking, setSpeaking] = useState<Voice>("");
  const [showSummary, setShowSummary] = useState(false);
  const [voiceNote, setVoiceNote] = useState("");
  const canVoice = !!(readAll || readSummary?.length) && canReadAloud();
  const summaryText = (readSummary || []).join(". ");
  const say = (v: Voice) => {
    const text = v === "all" ? readAll : summaryText;
    if (v === "summary") setShowSummary(true);
    setVoiceNote("");
    if (text && readAloud(text, () => setSpeaking(""), undefined, () => setVoiceNote("🔇 The phone didn't start the voice. Turn the ringer on and the volume up, then tap again."))) setSpeaking(v);
  };
  const hush = () => { stopReading(); setSpeaking(""); };
  const pick = (v: Voice) => {
    const next: Voice = speaking === v ? "" : v;
    setVoice(next);
    try { localStorage.setItem("hpd-read-voice", next || "off"); } catch {}
    if (next) say(next); else { hush(); setShowSummary(false); }
  };
  useEffect(() => { try { const v = localStorage.getItem("hpd-read-voice"); setVoice(v === "all" || v === "on" ? "all" : v === "summary" ? "summary" : ""); } catch {} }, []);
  useEffect(() => () => { stopReading(); }, []);
  useEffect(() => { setSpeed(readSpeed.x); }, []);
  useEffect(() => () => stopRead.current(), []);
  useEffect(() => { if (showDescription) setWantDesc(showDescription); }, [showDescription]);
  useEffect(() => {
    if (!wantDesc || !shown?.length) return;
    const first = descPages?.length ? descPages[0] : 3;
    const p = shown.find((x) => x.page === first) || shown.find((x) => x.page === 3) || shown[0];
    setWantDesc(0);
    autoZoom.current = workAt(p.page);
    setBig(p);
  }, [wantDesc, shown]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let live = true;
    setShown(null);
    setError("");
    // Page 1 is HPD's cover / header; the job description is on pages 2 and 3.
    // Any other PDF (HPD's notices): every page.
    const wanted = all || everyPage ? Array.from({ length: pageCount }, (_, i) => i + 1) : descriptionPages.length ? descriptionPages : [1];
    renderPages(pdfUrl, wanted)
      .then(({ pages }) => {
        if (!live) { pages.forEach((p) => URL.revokeObjectURL(p.url)); return; }
        urls.current.forEach((u) => URL.revokeObjectURL(u));
        urls.current = pages.map((p) => p.url);
        setShown(pages.length ? pages : []);
      })
      .catch((e) => { if (live) setError(String(e?.message || e)); });
    return () => { live = false; };
  }, [pdfUrl, pageCount, all, everyPage, descriptionPages.join()]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => urls.current.forEach((u) => URL.revokeObjectURL(u)), []);

  return (
    <section className="fc-itb-pages" data-hpd-smoke="fc-itb-pages">
      <div className="fc-itb-head">
        <b>{title ? `📄 ${title}` : <>📄 HPD&apos;s job description {all ? `(all ${pageCount} pages)` : descriptionPages.length > 1 ? `(pages ${descriptionPages[0]}–${descriptionPages[descriptionPages.length - 1]})` : ""}</>}</b>
        {!everyPage && descriptionPages.length > 2 ? <span className="fc-itb-more" data-hpd-smoke="fc-itb-continues">continues on page {descriptionPages.slice(2).join(", ")}</span> : null}
        {!everyPage && (pageCount > descriptionPages.length || all) ? <button type="button" data-hpd-smoke="fc-itb-all" onClick={() => setAll((v) => !v)}>{all ? "Only the job description" : "All pages"}</button> : null}
      </div>
      {error ? (/401/.test(error)
          ? <p className="fc-itb-msg" data-hpd-smoke="fc-itb-signin">HPD&apos;s pages are private (they name the tenant). <a href="/storage/">Sign in with Google</a> on this phone to see them.</p>
          : <p className="fc-itb-msg">Couldn&apos;t show the pages ({error}). <a href={pdfUrl} target="_blank" rel="noreferrer">Open the PDF</a></p>)
        : shown === null ? <p className="fc-itb-msg">Loading {title ? "HPD's pages" : "the invitation pages"}…</p>
        : !shown.length ? <p className="fc-itb-msg">No pages to show. <a href={pdfUrl} target="_blank" rel="noreferrer">Open the PDF</a></p>
        : (
          <div className="fc-itb-strip">
            {shown.map((p) => (
              <button key={p.page} type="button" className="fc-itb-thumb" data-hpd-smoke="fc-itb-thumb" aria-label={`Open page ${p.page} full screen`} onClick={() => setBig(p)}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt={`${title || "Invitation"} page ${p.page}`} />
                <span>Page {p.page} · tap to enlarge</span>
              </button>
            ))}
          </div>
        )}
      {big ? (
        <div className="fc-itb-full" role="dialog" aria-label={`Invitation page ${big.page}`} data-hpd-smoke="fc-itb-full">
          <div className="fc-itb-bar">
            <b>Page {big.page}{everyPage ? "" : ` of ${pageCount}`}</b>
            {shown && shown.length > 1 ? (
              <span>
                <button type="button" disabled={shown[0].page === big.page} onClick={() => setBig(shown[shown.findIndex((p) => p.page === big.page) - 1])}>‹ Prev</button>
                <button type="button" disabled={shown[shown.length - 1].page === big.page} onClick={() => setBig(shown[shown.findIndex((p) => p.page === big.page) + 1])}>Next ›</button>
              </span>
            ) : null}
            <button type="button" data-hpd-smoke="fc-itb-zoom" aria-label="Zoom" onClick={() => zoomTo(zoom >= 2.95 ? 1 : Math.floor(zoom) + 1)}>🔍 {zoom >= 2.95 ? "1×" : `${Math.floor(zoom) + 1}×`}</button>
            <button type="button" data-hpd-smoke="fc-itb-close" onClick={() => { hush(); setShowSummary(false); stopRead.current(); setReading(""); setBig(null); zoomTo(1); }}>Close</button>
          </div>
          <div className="fc-itb-full-body" {...bind} data-hpd-smoke="fc-itb-zoombox">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={big.url} alt={`${title || "Invitation"} page ${big.page}`} draggable={false} style={{ width: `${zoom * 100}%`, maxWidth: "none" }} onLoad={() => {
              const at = autoZoom.current;
              if (at === null) return;
              autoZoom.current = null;
              zoomTo(readAlong ? READ_ZOOM : 2);
              // After zoomTo's own scroll: the left margin, at the line where the work starts.
              requestAnimationFrame(() => requestAnimationFrame(() => {
                const el = bind.ref.current;
                if (!el) return;
                el.scrollLeft = el.scrollWidth * 0.02; el.scrollTop = el.scrollHeight * at;
                if (!readAlong) return;
                setReading("reading");
                stopRead.current();
                try { const v = localStorage.getItem("hpd-read-voice"); if (canVoice && (v === "all" || v === "on" || v === "summary")) say(v === "summary" ? "summary" : "all"); } catch {}
                // Page 3: the description fills most of the page; page 2's work box is shorter.
                stopRead.current = readAlongPage(el, at, big.page === 2 ? at + 0.22 : workEndAt(descChars), () => setReading("read"));
              }));
            }} />
          </div>
          {reading === "reading" ? (
            <div className="fc-itb-read-row">
              <button type="button" className="fc-itb-speed" data-hpd-smoke="fc-itb-slower" aria-label="Read slower" onClick={() => setSpeed(setReadSpeed(speed * 1.35))}>🐢</button>
              <button type="button" className="fc-itb-reading" data-hpd-smoke="fc-itb-reading" onClick={() => { stopRead.current(); setReading(""); }}>👀 Reading with you · tap to take over</button>
              <button type="button" className="fc-itb-speed" data-hpd-smoke="fc-itb-faster" aria-label="Read faster" onClick={() => setSpeed(setReadSpeed(speed / 1.35))}>🐇</button>
            </div>
          )
            : <small className="fc-itb-hint">Pinch or double-tap the page to zoom · drag to move</small>}
          {/* Read it, then one tap to the price box (2 Nov): the page closes and the keyboard opens on the price. */}
          {showSummary && readSummary?.length ? (
            <div className="fc-itb-summary" data-hpd-smoke="fc-itb-summary">
              <b>📝 The work in short</b>
              <ul>{readSummary.map((l, i) => <li key={i}>{l}</li>)}</ul>
              <button type="button" aria-label="Hide the summary" onClick={() => setShowSummary(false)}>✕</button>
            </div>
          ) : null}
          {voiceNote ? <p className="fc-itb-voice-note" role="status" data-hpd-smoke="fc-itb-voice-note">{voiceNote}</p> : null}
          {canVoice ? (
            <div className="fc-itb-voice-row" data-hpd-smoke="fc-itb-voice-row">
              {readAll ? <button type="button" className={speaking === "all" ? "is-on" : voice === "all" ? "is-picked" : ""} data-hpd-smoke="fc-itb-voice-all" aria-pressed={speaking === "all"} onClick={() => pick("all")}>{speaking === "all" ? "🔇 Stop" : "🔊 Read it all"}</button> : null}
              {readSummary?.length ? <button type="button" className={speaking === "summary" ? "is-on" : voice === "summary" ? "is-picked" : ""} data-hpd-smoke="fc-itb-voice-summary" aria-pressed={speaking === "summary"} onClick={() => pick("summary")}>{speaking === "summary" ? "🔇 Stop" : "📝 Summary"}</button> : null}
            </div>
          ) : null}
          {onPrice ? <button type="button" className={`fc-itb-price${reading === "read" ? " is-ready" : ""}`} data-hpd-smoke="fc-itb-price" onClick={() => { hush(); setShowSummary(false); stopRead.current(); setReading(""); setBig(null); zoomTo(1); onPrice(); }}>💰 Price it</button> : null}
        </div>
      ) : null}
    </section>
  );
}
