"use client";
// ✅ Upgrades done (owner, 15 Nov: "i need a list in the app of all ideas upgrades we have done to this app, i should be
// able to edit them"): every change from What's new (public/data/whats-new.json), newest day first, with search.
// Each one can be edited (your words replace Claude's, ↩ goes back), removed (and brought back), and you can add
// your own. 📋 Copy all puts the whole list on the clipboard. Your edits are kept on this phone (localStorage).

import { useEffect, useMemo, useState } from "react";

type Version = { date: string; title?: string; items: string[] };
type Edits = { text: Record<string, string>; removed: Record<string, string>; added: { id: string; date: string; text: string }[] };
const KEY = "hpd-upgrades-done-v1";
const EMPTY: Edits = { text: {}, removed: {}, added: [] };

// A stable id for an item: its day + its original words (the list is rebuilt from What's new on every open).
function idOf(date: string, text: string) {
  let h = 5381;
  const s = `${date}|${text}`;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return `u${(h >>> 0).toString(36)}`;
}
function readEdits(): Edits {
  try { const e = JSON.parse(localStorage.getItem(KEY) || "null"); return e && typeof e === "object" ? { ...EMPTY, ...e } : EMPTY; } catch { return EMPTY; }
}
const todayLabel = () => new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

// The list by part of the app (owner, 18 Nov "do all": quick buttons to see one area at a time). An item can be in
// more than one area; one that matches none shows under All only.
const AREAS: { key: string; label: string; re: RegExp }[] = [
  { key: "bids", label: "💰 Bids", re: /\b(bids?|bidding|invitations?|ITB|price|easy win|award(ed|s)?)\b/i },
  { key: "jobs", label: "🔨 Jobs", re: /\b(jobs?|job card|route|visit|photos?|before|after|tenant|access|map|pins?|waze)\b/i },
  { key: "notices", label: "🔔 Notices", re: /\b(notices?|72-hour|24-hour|board|HPD (asked|wants)|gmail|emails?|reply|replies|priority|rejected|corrections?)\b/i },
  { key: "paperwork", label: "📄 Paperwork", re: /\b(paperwork|affidavits?|invoices?|package|notary|signature|PDF|fax|print)\b/i },
  { key: "helper", label: "🤖 Helper", re: /\b(helper|Claude|AI|voice|mic|says?|said|speak|talk|chat|driving|hands-free)\b/i },
];

export default function UpgradesDone({ versions, onClose, onAskChange }: { versions: Version[] | null | undefined; onClose: () => void; onAskChange: (text: string) => void }) {
  const [edits, setEdits] = useState<Edits>(EMPTY);
  const [find, setFind] = useState("");
  const [area, setArea] = useState("");
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const [showRemoved, setShowRemoved] = useState(false);
  const [note, setNote] = useState("");
  useEffect(() => { setEdits(readEdits()); }, []);
  const save = (next: Edits) => { setEdits(next); try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* private mode: lasts this visit */ } };

  // Days, newest first; your own additions go on their day (a new day on top when it isn't in What's new).
  const days = useMemo(() => {
    const out: { date: string; title: string; items: { id: string; text: string; original: string; mine: boolean }[] }[] = [];
    for (const v of versions || []) out.push({ date: v.date, title: v.title || "", items: v.items.map((t) => { const id = idOf(v.date, t); return { id, text: edits.text[id] ?? t, original: t, mine: false }; }) });
    for (const a of edits.added) {
      let d = out.find((x) => x.date === a.date);
      if (!d) { d = { date: a.date, title: "", items: [] }; out.push(d); }
      d.items.unshift({ id: a.id, text: edits.text[a.id] ?? a.text, original: a.text, mine: true });
    }
    return out.sort((a, b) => (Date.parse(b.date) || 0) - (Date.parse(a.date) || 0));
  }, [versions, edits]);
  const q = find.trim().toLowerCase();
  const areaRe = AREAS.find((a) => a.key === area)?.re;
  const shown = days.map((d) => ({ ...d, items: d.items.filter((i) => !edits.removed[i.id] && (!areaRe || areaRe.test(i.text)) && (!q || i.text.toLowerCase().includes(q) || d.date.toLowerCase().includes(q))) })).filter((d) => d.items.length);
  const live = days.flatMap((d) => d.items.filter((i) => !edits.removed[i.id]));
  const areaCount = (re: RegExp) => live.filter((i) => re.test(i.text)).length;
  const removed = days.flatMap((d) => d.items.filter((i) => edits.removed[i.id]).map((i) => ({ ...i, date: d.date })));
  const count = days.reduce((n, d) => n + d.items.filter((i) => !edits.removed[i.id]).length, 0);
  const found = shown.reduce((n, d) => n + d.items.length, 0);

  const saveEdit = () => {
    if (!editing) return;
    const words = editing.text.trim();
    const item = days.flatMap((d) => d.items).find((i) => i.id === editing.id);
    if (!words || !item) { setEditing(null); return; }
    const text = { ...edits.text };
    if (words === item.original) delete text[editing.id]; else text[editing.id] = words;
    save({ ...edits, text });
    setEditing(null);
    setNote("✅ Saved your words.");
  };
  const undoEdit = (id: string) => { const text = { ...edits.text }; delete text[id]; save({ ...edits, text }); setEditing(null); setNote("↩ Back to the original words."); };
  const remove = (id: string, mine: boolean) => {
    if (mine) { const text = { ...edits.text }; delete text[id]; save({ ...edits, text, added: edits.added.filter((a) => a.id !== id) }); setNote("🗑 Removed your item."); return; }
    save({ ...edits, removed: { ...edits.removed, [id]: new Date().toISOString() } });
    setNote("🗑 Removed. Bring it back under Removed at the bottom.");
  };
  const restore = (id: string) => { const r = { ...edits.removed }; delete r[id]; save({ ...edits, removed: r }); setNote("↩ Brought back."); };
  const add = () => {
    const words = (adding || "").trim();
    if (!words) { setAdding(null); return; }
    const date = todayLabel();
    save({ ...edits, added: [{ id: `m${Date.now().toString(36)}`, date, text: words }, ...edits.added] });
    setAdding(null);
    setFind("");
    setNote("✅ Added to today.");
  };
  const copyAll = async () => {
    const text = shown.map((d) => `${d.date}${d.title ? ` · ${d.title}` : ""}\n${d.items.map((i) => `- ${i.text}`).join("\n")}`).join("\n\n");
    try { await navigator.clipboard.writeText(text); setNote(`📋 Copied ${found} upgrades.`); } catch { setNote("Couldn't copy on this phone."); }
  };

  return (
    <div className="fc-package-sheet fc-summary-sheet fc-upgrades-sheet" role="dialog" aria-label="Upgrades done" data-hpd-smoke="fc-upgrades">
      <header>
        <button type="button" aria-label="Close" data-hpd-smoke="fc-upgrades-close" onClick={onClose}>Close</button>
        <strong>✅ Upgrades done ({versions ? count : "…"})</strong>
      </header>
      <div className="fc-summary-body">
        <p className="fc-follow-note">Everything built into the app, newest first. ✏️ change the words, 🗑 remove, ＋ add your own. Kept on this phone.</p>
        <div className="fc-upgrades-tools">
          <input type="search" placeholder="Find an upgrade (door, fax, voice…)" aria-label="Find an upgrade" data-hpd-smoke="fc-upgrades-find" value={find} onChange={(e) => setFind(e.target.value)} />
          <button type="button" data-hpd-smoke="fc-upgrades-add" onClick={() => setAdding((a) => (a === null ? "" : null))}>＋ Add</button>
          <button type="button" data-hpd-smoke="fc-upgrades-copy" onClick={() => void copyAll()}>📋 Copy all</button>
        </div>
        <div className="fc-upgrades-areas" role="group" aria-label="Show one part of the app" data-hpd-smoke="fc-upgrades-areas">
          <button type="button" className={area ? "" : "is-on"} aria-pressed={!area} data-hpd-smoke="fc-upgrades-area-all" onClick={() => setArea("")}>All</button>
          {AREAS.map((a) => (
            <button key={a.key} type="button" className={area === a.key ? "is-on" : ""} aria-pressed={area === a.key} data-hpd-smoke={`fc-upgrades-area-${a.key}`} onClick={() => setArea(area === a.key ? "" : a.key)}>{a.label} <em>{areaCount(a.re)}</em></button>
          ))}
        </div>
        {adding !== null ? (
          <div className="fc-upgrades-edit" data-hpd-smoke="fc-upgrades-add-box">
            <textarea rows={3} placeholder="What was added or changed, in your words" aria-label="Your upgrade" data-hpd-smoke="fc-upgrades-add-text" value={adding} onChange={(e) => setAdding(e.target.value)} autoFocus />
            <span><button type="button" className="is-save" data-hpd-smoke="fc-upgrades-add-save" onClick={add}>Save</button><button type="button" onClick={() => setAdding(null)}>Cancel</button></span>
          </div>
        ) : null}
        {note ? <p className="fc-follow-note" role="status" data-hpd-smoke="fc-upgrades-note">{note}</p> : null}
        {versions === undefined ? <p className="fc-follow-note">Loading…</p> : null}
        {q ? <p className="fc-follow-note" data-hpd-smoke="fc-upgrades-found">{found ? `${found} found for “${find.trim()}”.` : `Nothing found for “${find.trim()}”.`}</p> : null}
        {/* Two What's new entries can share a day: key by day + title so React never mixes their items up. */}
        {shown.map((d, n) => (
          <section key={`${d.date}|${d.title}|${n}`} className="fc-upgrades-day" data-hpd-smoke="fc-upgrades-day">
            <h4>{d.date}{d.title ? <small> · {d.title}</small> : null}</h4>
            <ul>
              {d.items.map((i) => (
                <li key={i.id} className="fc-upgrade" data-hpd-smoke="fc-feature" data-id={i.id}>
                  {editing?.id === i.id ? (
                    <div className="fc-upgrades-edit">
                      <textarea rows={4} aria-label="Change the words" data-hpd-smoke="fc-upgrade-edit-text" value={editing.text} onChange={(e) => setEditing({ id: i.id, text: e.target.value })} autoFocus />
                      <span>
                        <button type="button" className="is-save" data-hpd-smoke="fc-upgrade-edit-save" onClick={saveEdit}>Save</button>
                        <button type="button" onClick={() => setEditing(null)}>Cancel</button>
                        {edits.text[i.id] !== undefined && !i.mine ? <button type="button" data-hpd-smoke="fc-upgrade-edit-undo" onClick={() => undoEdit(i.id)}>↩ Original words</button> : null}
                      </span>
                    </div>
                  ) : (
                    <>
                      <span>{i.text}{i.mine ? <small className="fc-upgrade-tag"> · added by you</small> : edits.text[i.id] !== undefined ? <small className="fc-upgrade-tag"> · your words</small> : null}</span>
                      <span className="fc-idea-btns">
                        <button type="button" className="fc-idea-skip" data-hpd-smoke="fc-upgrade-edit" onClick={() => setEditing({ id: i.id, text: i.text })}>✏️ Edit</button>
                        <button type="button" className="fc-idea-skip" data-hpd-smoke="fc-upgrade-remove" onClick={() => remove(i.id, i.mine)}>🗑 Remove</button>
                        <button type="button" className="fc-idea-skip" data-hpd-smoke="fc-feature-change" onClick={() => onAskChange(`Change this: ${i.text.slice(0, 160)} → I want: `)}>💬 Ask Claude</button>
                      </span>
                    </>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}
        {removed.length ? (
          <div className="fc-idea-skipped" data-hpd-smoke="fc-upgrades-removed">
            <button type="button" className="fc-idea-skip" data-hpd-smoke="fc-upgrades-removed-toggle" onClick={() => setShowRemoved((v) => !v)}>🗑 Removed ({removed.length}): {showRemoved ? "hide" : "show"}</button>
            {showRemoved ? <ul>{removed.map((i) => <li key={i.id}><span>{i.date}: {i.text}</span> <button type="button" className="fc-idea-skip" data-hpd-smoke="fc-upgrade-restore" data-id={i.id} onClick={() => restore(i.id)}>↩ Bring back</button></li>)}</ul> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
