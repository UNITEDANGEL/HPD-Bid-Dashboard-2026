"use client";

// The invitation's own job-description pages (2 and 3 of HPD's PDF) as pictures in the bid card, so the
// wording, tables and sketches read exactly as HPD wrote them. Tap a page to open it full screen
// (pinch to zoom); "All pages" shows the whole invitation.
import { useEffect, useRef, useState } from "react";
import { getPages, prunePages, putPages } from "../../lib/page-cache";
import { usePinchZoom } from "../../lib/use-pinch-zoom";

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

// Read along (owner, 5 Nov: "scroll it slowly left and right, read the whole description, like I'm scrolling it"): the
// zoomed page pans slowly across each part of the work, then down to the next, to the end of the description. Any
// touch hands it back to you.
function readAlongPage(el: HTMLElement, startAt: number, endAt: number, onDone: () => void) {
  const pace = (() => { try { return navigator.webdriver ? 0.15 : 1; } catch { return 1; } })();
  let stop = false;
  const off = () => { stop = true; };
  el.addEventListener("pointerdown", off, { once: true });
  el.addEventListener("wheel", off, { once: true, passive: true });
  el.addEventListener("touchstart", off, { once: true, passive: true });
  const ease = (x: number) => (x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2);
  const glide = (toLeft: number, toTop: number, ms: number) => new Promise<void>((done) => {
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
    const left = el.scrollWidth * 0.04;
    const right = Math.max(left, el.scrollWidth - el.clientWidth - el.scrollWidth * 0.03);
    const end = Math.min(el.scrollHeight - el.clientHeight, el.scrollHeight * endAt);
    let top = el.scrollHeight * startAt;
    for (let row = 0; row < 8 && !stop; row += 1) {
      await glide(right, top, 3200 * pace);            // across the lines, left to right
      if (stop || top >= end) break;
      top = Math.min(end, top + el.clientHeight * 0.45);
      await glide(left, top, 900 * pace);              // back to the left, a little further down
    }
    el.removeEventListener("pointerdown", off);
    el.removeEventListener("wheel", off);
    el.removeEventListener("touchstart", off);
    onDone();
  })();
  return off;
}

export default function ItbPages({ pdfUrl, pageCount, descPages, everyPage, title, showDescription = 0, readAlong = false, onPrice }: { pdfUrl: string; pageCount: number; descPages?: number[]; everyPage?: boolean; title?: string; showDescription?: number; readAlong?: boolean; onPrice?: () => void }) {
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
            <button type="button" data-hpd-smoke="fc-itb-close" onClick={() => { stopRead.current(); setReading(""); setBig(null); zoomTo(1); }}>Close</button>
          </div>
          <div className="fc-itb-full-body" {...bind} data-hpd-smoke="fc-itb-zoombox">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={big.url} alt={`${title || "Invitation"} page ${big.page}`} draggable={false} style={{ width: `${zoom * 100}%`, maxWidth: "none" }} onLoad={() => {
              const at = autoZoom.current;
              if (at === null) return;
              autoZoom.current = null;
              zoomTo(2);
              // After zoomTo's own scroll: the left margin, at the line where the work starts.
              requestAnimationFrame(() => requestAnimationFrame(() => {
                const el = bind.ref.current;
                if (!el) return;
                el.scrollLeft = el.scrollWidth * 0.04; el.scrollTop = el.scrollHeight * at;
                if (!readAlong) return;
                setReading("reading");
                stopRead.current();
                // Page 3: the description fills most of the page; page 2's work box is shorter.
                stopRead.current = readAlongPage(el, at, big.page === 2 ? at + 0.22 : 0.85, () => setReading("read"));
              }));
            }} />
          </div>
          {reading === "reading" ? <button type="button" className="fc-itb-reading" data-hpd-smoke="fc-itb-reading" onClick={() => { stopRead.current(); setReading(""); }}>👀 Reading it with you… tap the page to take over</button>
            : <small className="fc-itb-hint">Pinch or double-tap the page to zoom · drag to move</small>}
          {/* Read it, then one tap to the price box (2 Nov): the page closes and the keyboard opens on the price. */}
          {onPrice ? <button type="button" className={`fc-itb-price${reading === "read" ? " is-ready" : ""}`} data-hpd-smoke="fc-itb-price" onClick={() => { stopRead.current(); setReading(""); setBig(null); zoomTo(1); onPrice(); }}>💰 Price it</button> : null}
        </div>
      ) : null}
    </section>
  );
}
