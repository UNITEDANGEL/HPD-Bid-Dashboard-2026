"use client";
// Find any job (owner, 22 Oct: "I should be able to type a small description and it should guide me to the job; by
// address or job"): under the map's search box, every job that matches -- yours, open bids, past invitations and
// HPD's awards -- with the words that matched. Tap one: your job opens its card, an open bid opens the bid, anything
// else shows its address, HPD's description and the invitation.
import { useEffect, useMemo, useState } from "react";
import { searchJobs, snippet, type SearchItem } from "../../lib/job-search";
import { itbPdfUrl, loadSearchIndex } from "../../lib/private-data";

const KIND: Record<string, [string, string]> = { yours: ["Your job", "is-yours"], bid: ["Open bid", "is-bid"], award: ["Awarded", "is-award"], invitation: ["Invitation", "is-inv"] };
const money = (n?: number) => (n ? `$${Math.round(n).toLocaleString("en-US")}` : "");
const day = (s?: string) => (s ? new Date(`${s.slice(0, 10)}T12:00:00`).toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "2-digit" }) : "");

export default function FindJob({ query, onOpen, onClose }: { query: string; onOpen: (item: SearchItem) => boolean; onClose: () => void }) {
  const [items, setItems] = useState<SearchItem[] | null | "loading">("loading");
  const [open, setOpen] = useState<SearchItem | null>(null);
  useEffect(() => { let live = true; void loadSearchIndex().then((d) => { if (live) setItems(d ? d.items : null); }); return () => { live = false; }; }, []);
  useEffect(() => setOpen(null), [query]);
  const found = useMemo(() => (Array.isArray(items) ? searchJobs(items, query, 25) : []), [items, query]);
  return (
    <section className="fc-find" data-hpd-smoke="fc-find" aria-label="Find any job">
      <header>
        <b data-hpd-smoke="fc-find-count">{items === "loading" ? "🔍 Looking…" : items === null ? "🔍 Sign in to search every job" : `🔍 ${found.length}${found.length === 25 ? "+" : ""} job${found.length === 1 ? "" : "s"} found`}</b>
        <button type="button" aria-label="Close" data-hpd-smoke="fc-find-close" onClick={onClose}>✕</button>
      </header>
      {Array.isArray(items) && !found.length ? <p className="fc-find-none">No job with &quot;{query}&quot;. Try fewer words, part of the address, or the job number.</p> : null}
      <ol>
        {found.map(({ item, where }) => (
          <li key={item.omo} data-hpd-smoke="fc-find-row" data-omo={item.omo} className={open?.omo === item.omo ? "is-open" : ""}>
            <button type="button" onClick={() => { if (!onOpen(item)) setOpen(open?.omo === item.omo ? null : item); }}>
              <span className="fc-find-top">
                <b>{item.omo}</b>
                {item.kinds.filter((k) => KIND[k]).slice(0, 2).map((k) => <em key={k} className={KIND[k][1]}>{KIND[k][0]}</em>)}
                <small>{item.due ? `due ${day(item.due)}` : day(item.date)}</small>
              </span>
              <span className="fc-find-addr">{item.address || "Address not on record"}{item.boro ? ` · ${item.boro}` : ""}</span>
              {item.desc ? <span className="fc-find-desc">{where === "desc" ? snippet(item.desc, query) : snippet(item.desc, "", 110)}</span> : null}
            </button>
            {open?.omo === item.omo ? (
              <div className="fc-find-more" data-hpd-smoke="fc-find-more">
                {item.amount ? <p>{item.won === "no" ? `Awarded to another contractor for ${money(item.amount)}` : `Awarded ${money(item.amount)}`}{item.date ? ` on ${day(item.date)}` : ""}</p> : <p>Not awarded yet (as far as HPD&apos;s list shows).</p>}
                <p className="fc-find-full">{item.desc}</p>
                <div className="fc-find-links">
                  {item.address ? <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${item.address}, ${item.boro || "New York"}, NY`)}`} target="_blank" rel="noreferrer">📍 Map</a> : null}
                  {item.file ? <a href={itbPdfUrl(item.file)} target="_blank" rel="noreferrer" data-hpd-smoke="fc-find-pdf">📄 Invitation</a> : null}
                </div>
              </div>
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  );
}
