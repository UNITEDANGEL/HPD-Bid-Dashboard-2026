"use client";

// The invitation's own job-description pages (2 and 3 of HPD's PDF) as pictures in the bid card, so the
// wording, tables and sketches read exactly as HPD wrote them. Tap a page to open it full screen
// (pinch to zoom); "All pages" shows the whole invitation.
import { useEffect, useRef, useState } from "react";
import { getPages, prunePages, putPages } from "../../lib/page-cache";

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

export default function ItbPages({ pdfUrl, pageCount, descPages, everyPage, title }: { pdfUrl: string; pageCount: number; descPages?: number[]; everyPage?: boolean; title?: string }) {
  // HPD's form (page 2) and every page the job description is on (3, and 4+ when a long job continues).
  const descriptionPages = bidPages(pageCount, descPages);
  const [shown, setShown] = useState<Rendered[] | null>(null);
  // The whole invitation by default (owner, 16 Oct: other pages can have more information); the button shows
  // only the job-description pages.
  const [all, setAll] = useState(true);
  const [error, setError] = useState("");
  const [big, setBig] = useState<Rendered | null>(null);
  const [zoom, setZoom] = useState(1);
  const urls = useRef<string[]>([]);

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
            <button type="button" data-hpd-smoke="fc-itb-zoom" aria-label="Zoom" onClick={() => setZoom((z) => (z >= 3 ? 1 : z + 1))}>🔍 {zoom >= 3 ? "1×" : `${zoom + 1}×`}</button>
            <button type="button" data-hpd-smoke="fc-itb-close" onClick={() => { setBig(null); setZoom(1); }}>Close</button>
          </div>
          <div className="fc-itb-full-body">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={big.url} alt={`${title || "Invitation"} page ${big.page}`} style={{ width: `${zoom * 100}%`, maxWidth: "none" }} />
          </div>
        </div>
      ) : null}
    </section>
  );
}
