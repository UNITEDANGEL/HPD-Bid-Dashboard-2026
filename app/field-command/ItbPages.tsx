"use client";

// The invitation's own job-description pages (2 and 3 of HPD's PDF) as pictures in the bid card, so the
// wording, tables and sketches read exactly as HPD wrote them. Tap a page to open it full screen
// (pinch to zoom); "All pages" shows the whole invitation.
import { useEffect, useRef, useState } from "react";

type Rendered = { page: number; url: string };

async function renderPages(pdfUrl: string, pages: number[]) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url).toString();
  const res = await fetch(pdfUrl);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const task = pdfjs.getDocument({ data: new Uint8Array(await res.arrayBuffer()), stopAtErrors: false });
  const doc = await task.promise;
  const out: Rendered[] = [];
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
      if (blob) out.push({ page: n, url: URL.createObjectURL(blob) });
    }
    return { pages: out, total: doc.numPages };
  } finally {
    await task.destroy();
  }
}

export default function ItbPages({ pdfUrl, pageCount }: { pdfUrl: string; pageCount: number }) {
  const [shown, setShown] = useState<Rendered[] | null>(null);
  const [all, setAll] = useState(false);
  const [error, setError] = useState("");
  const [big, setBig] = useState<Rendered | null>(null);
  const [zoom, setZoom] = useState(1);
  const urls = useRef<string[]>([]);

  useEffect(() => {
    let live = true;
    setShown(null);
    setError("");
    // Page 1 is HPD's cover / header; the job description is on pages 2 and 3.
    const wanted = all ? Array.from({ length: pageCount }, (_, i) => i + 1) : pageCount >= 3 ? [2, 3] : pageCount === 2 ? [2] : [1];
    renderPages(pdfUrl, wanted)
      .then(({ pages }) => {
        if (!live) { pages.forEach((p) => URL.revokeObjectURL(p.url)); return; }
        urls.current.forEach((u) => URL.revokeObjectURL(u));
        urls.current = pages.map((p) => p.url);
        setShown(pages.length ? pages : []);
      })
      .catch((e) => { if (live) setError(String(e?.message || e)); });
    return () => { live = false; };
  }, [pdfUrl, pageCount, all]);
  useEffect(() => () => urls.current.forEach((u) => URL.revokeObjectURL(u)), []);

  return (
    <section className="fc-itb-pages" data-hpd-smoke="fc-itb-pages">
      <div className="fc-itb-head">
        <b>📄 HPD&apos;s job description {all ? `(all ${pageCount} pages)` : pageCount >= 3 ? "(pages 2–3)" : ""}</b>
        {pageCount > 3 || all ? <button type="button" onClick={() => setAll((v) => !v)}>{all ? "Pages 2–3" : "All pages"}</button> : null}
      </div>
      {error ? <p className="fc-itb-msg">Couldn&apos;t show the pages ({error}). <a href={pdfUrl} target="_blank" rel="noreferrer">Open the PDF</a></p>
        : shown === null ? <p className="fc-itb-msg">Loading the invitation pages…</p>
        : !shown.length ? <p className="fc-itb-msg">No pages to show. <a href={pdfUrl} target="_blank" rel="noreferrer">Open the PDF</a></p>
        : (
          <div className="fc-itb-strip">
            {shown.map((p) => (
              <button key={p.page} type="button" className="fc-itb-thumb" data-hpd-smoke="fc-itb-thumb" aria-label={`Open page ${p.page} full screen`} onClick={() => setBig(p)}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt={`Invitation page ${p.page}`} />
                <span>Page {p.page} · tap to enlarge</span>
              </button>
            ))}
          </div>
        )}
      {big ? (
        <div className="fc-itb-full" role="dialog" aria-label={`Invitation page ${big.page}`} data-hpd-smoke="fc-itb-full">
          <div className="fc-itb-bar">
            <b>Page {big.page} of {pageCount}</b>
            {shown && shown.length > 1 ? (
              <span>
                <button type="button" disabled={shown[0].page === big.page} onClick={() => setBig(shown[shown.findIndex((p) => p.page === big.page) - 1])}>‹ Prev</button>
                <button type="button" disabled={shown[shown.length - 1].page === big.page} onClick={() => setBig(shown[shown.findIndex((p) => p.page === big.page) + 1])}>Next ›</button>
              </span>
            ) : null}
            <button type="button" data-hpd-smoke="fc-itb-zoom" aria-label="Zoom" onClick={() => setZoom((z) => (z >= 3 ? 1 : z + 1))}>🔍 {zoom >= 3 ? "1×" : `${zoom + 1}×`}</button>
            <button type="button" data-hpd-smoke="fc-itb-close" onClick={() => { setBig(null); setZoom(1); }}>Close</button>
          </div>
          <div className="fc-itb-full-body">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={big.url} alt={`Invitation page ${big.page}`} style={{ width: `${zoom * 100}%`, maxWidth: "none" }} />
          </div>
        </div>
      ) : null}
    </section>
  );
}
