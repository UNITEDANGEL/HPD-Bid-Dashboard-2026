// Pages of HPD's PDFs already drawn as pictures, kept on this phone (IndexedDB) so an invitation opens
// instantly the second time and the next bids due can be drawn ahead. Only on the owner's device (the
// pages come from the signed-in route); old pages are dropped after 21 days.

const DB = "hpd-page-cache";
const STORE = "pages";
const MAX_AGE = 21 * 86400000;

type Row = { key: string; blob: Blob; at: number };

let dbp: Promise<IDBDatabase | null> | null = null;
function db(): Promise<IDBDatabase | null> {
  if (!dbp) {
    dbp = new Promise((ok) => {
      try {
        const req = indexedDB.open(DB, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "key" });
        req.onsuccess = () => ok(req.result);
        req.onerror = () => ok(null);
      } catch {
        ok(null);
      }
    });
  }
  return dbp;
}

export const pageKey = (pdfUrl: string, page: number) => `${pdfUrl}#${page}`;

export async function getPages(pdfUrl: string, pages: number[]): Promise<Map<number, Blob>> {
  const d = await db();
  const out = new Map<number, Blob>();
  if (!d) return out;
  await new Promise<void>((done) => {
    try {
      const st = d.transaction(STORE, "readonly").objectStore(STORE);
      let left = pages.length;
      if (!left) return done();
      for (const n of pages) {
        const r = st.get(pageKey(pdfUrl, n));
        r.onsuccess = () => { const row = r.result as Row | undefined; if (row && Date.now() - row.at < MAX_AGE) out.set(n, row.blob); if (--left === 0) done(); };
        r.onerror = () => { if (--left === 0) done(); };
      }
    } catch {
      done();
    }
  });
  return out;
}

export async function putPages(pdfUrl: string, pages: { page: number; blob: Blob }[]) {
  const d = await db();
  if (!d || !pages.length) return;
  try {
    const st = d.transaction(STORE, "readwrite").objectStore(STORE);
    for (const p of pages) st.put({ key: pageKey(pdfUrl, p.page), blob: p.blob, at: Date.now() } satisfies Row);
  } catch {
    // full or blocked: the pages are just drawn again next time
  }
}

// Drop pages older than 21 days (once per page load).
let pruned = false;
export async function prunePages() {
  if (pruned) return;
  pruned = true;
  const d = await db();
  if (!d) return;
  try {
    const st = d.transaction(STORE, "readwrite").objectStore(STORE);
    const cur = st.openCursor();
    cur.onsuccess = () => { const c = cur.result; if (!c) return; if (Date.now() - (c.value as Row).at >= MAX_AGE) c.delete(); c.continue(); };
  } catch {
    // nothing to clean
  }
}
