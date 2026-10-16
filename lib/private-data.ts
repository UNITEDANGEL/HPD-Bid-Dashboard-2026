// Tenant names / phones and HPD's invitation PDFs are kept off the public site (scripts/privatize_public_data.mjs);
// the app gets them from the signed-in route /api/private/* (server/private-data.mjs). Not signed in with
// Google on this device: jobs show without tenant details and invitation pages ask you to sign in.

export type PrivateBundle = { jobs: Record<string, Record<string, unknown>>; bids: Record<string, Record<string, unknown>> };

let pending: Promise<PrivateBundle | null> | null = null;

// Loaded once per page (it's small); null when not signed in or the server can't open it.
export function loadPrivate(fetcher: typeof fetch = fetch): Promise<PrivateBundle | null> {
  if (!pending) {
    pending = fetcher("/api/private/tenants", { cache: "no-store", credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => (d && typeof d === "object" ? { jobs: d.jobs || {}, bids: d.bids || {} } : null))
      .catch(() => null);
  }
  return pending;
}

// Put the private values back on each record (by OMO).
export function withPrivate<T extends Record<string, unknown>>(rows: T[], map: Record<string, Record<string, unknown>> | undefined | null): T[] {
  if (!map || !Object.keys(map).length) return rows;
  return rows.map((r) => {
    const omo = String(r.OMO || r.omo || "").toUpperCase();
    const p = map[omo];
    return p ? ({ ...r, ...p } as T) : r;
  });
}

// HPD's invitation PDF / page-3 picture, through the signed-in route.
export const itbPdfUrl = (file: string) => `/api/private/itb/${encodeURIComponent(file)}`;
export const itbPageUrl = (file: string) => `/api/private/itb-page/${encodeURIComponent(file)}`;

// Old public paths in the manifest ("/documents/itb/X.pdf", "/documents/itb-pages/X.png") -> the private route.
export function privateDocUrl(url: string) {
  const m = /^\/documents\/(itb|itb-pages)\/(.+)$/.exec(url || "");
  if (!m) return url;
  const file = decodeURIComponent(m[2]);
  return m[1] === "itb" ? itbPdfUrl(file) : itbPageUrl(file);
}

// HPD's notice emails (scripts/fetch_notice_documents.py): OMO -> newest first.
// signer: the name at the bottom of HPD's notice ("MICHAEL WRIGHT JR, CCAP"); replyTo: their @hpd.nyc.gov address.
export type NoticeEmail = { date: string; from: string; subject: string; body: string; files: { file: string; name: string }[]; signer?: string; replyTo?: string };
let noticesPending: Promise<Record<string, NoticeEmail[]> | null> | null = null;
export function loadNotices(fetcher: typeof fetch = fetch): Promise<Record<string, NoticeEmail[]> | null> {
  if (!noticesPending) {
    noticesPending = fetcher("/api/private/notices", { cache: "no-store", credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
  }
  return noticesPending;
}
export const noticePdfUrl = (file: string) => `/api/private/notice/${encodeURIComponent(file)}`;

// Email threads with HPD staff (scripts/fetch_hpd_conversations.py), newest first. waiting = HPD wrote last.
export type HpdMessage = { at: string; from: string; hpd: boolean; mine: boolean; subject: string; text: string; files: string[] };
export type HpdThread = { id: string; subject: string; omos: string[]; kind: string; people: string[]; count: number; lastAt: string; waiting: boolean; messages: HpdMessage[] };
let convPending: Promise<{ generatedAt: string; threads: HpdThread[] } | null> | null = null;
export function loadConversations(fetcher: typeof fetch = fetch) {
  if (!convPending) {
    convPending = fetcher("/api/private/conversations", { cache: "no-store", credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => (d && Array.isArray(d.threads) ? d : null))
      .catch(() => null);
  }
  return convPending;
}
