// HPD's invitation PDFs and page pictures moved off the public site (they show the tenant): they're encrypted
// under /private/ and opened through /api/private/* with the owner's Google sign-in. This function answers every
// old /documents/... address so Cloudflare's edge can't keep serving copies it cached before the move.
export function onRequest() {
  return new Response("This document is private now. Open it from the HPD app while signed in with Google.", {
    status: 404,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}
