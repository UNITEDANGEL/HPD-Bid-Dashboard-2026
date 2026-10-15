"use client";

// The building on an invitation: year built, floors, apartments, walk-up or elevator, open HPD
// violations, and the open ones that match this bid's work (NYC Open Data, read from the phone).
import { useEffect, useState } from "react";
import { loadBuildingFacts, type BuildingFacts as Facts } from "../../lib/building-facts";

const CACHE_MS = 12 * 60 * 60 * 1000;
const cacheKey = (address: string, borough: string) => `hpd-building-v2:${address}|${borough}`;

export default function BuildingFacts({ address, borough, description }: { address: string; borough: string; description: string }) {
  const [facts, setFacts] = useState<Facts | null | undefined>(undefined);
  const [failed, setFailed] = useState(false);
  const [tries, setTries] = useState(0);

  useEffect(() => {
    let live = true;
    setFacts(undefined);
    setFailed(false);
    try {
      const hit = JSON.parse(localStorage.getItem(cacheKey(address, borough)) || "null");
      if (hit && Date.now() - hit.at < CACHE_MS && hit.desc === description) { setFacts(hit.facts); return; }
    } catch {}
    loadBuildingFacts(address, borough, description)
      .then((f) => {
        if (!live) return;
        setFacts(f);
        try { localStorage.setItem(cacheKey(address, borough), JSON.stringify({ at: Date.now(), desc: description, facts: f })); } catch {}
      })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [address, borough, description, tries]);

  if (failed) {
    return (
      <section className="fc-bldg is-off" data-hpd-smoke="fc-bldg">
        <p>🏢 Building facts didn&apos;t load (NYC Open Data). <button type="button" onClick={() => setTries((t) => t + 1)}>Try again</button></p>
      </section>
    );
  }
  if (facts === undefined) return <section className="fc-bldg is-loading" data-hpd-smoke="fc-bldg"><p>🏢 Looking up the building…</p></section>;
  if (facts === null) return <section className="fc-bldg is-off" data-hpd-smoke="fc-bldg"><p>🏢 Building not found in NYC records for this address.</p></section>;

  const age = facts.yearBuilt ? new Date().getFullYear() - facts.yearBuilt : 0;
  const bits = [
    facts.yearBuilt ? `Built ${facts.yearBuilt} (${age} yrs)` : "",
    facts.floors ? `${facts.floors} floor${facts.floors === 1 ? "" : "s"}` : "",
    facts.kind,
    facts.units ? `${facts.units} apartment${facts.units === 1 ? "" : "s"}` : "",
  ].filter(Boolean);
  return (
    <section className="fc-bldg" data-hpd-smoke="fc-bldg">
      <h4>🏢 Building</h4>
      <p className="fc-bldg-facts" data-hpd-smoke="fc-bldg-facts">{bits.join(" · ") || "No building details on file"}</p>
      <p className={`fc-bldg-viol${facts.open.C ? " has-c" : ""}`} data-hpd-smoke="fc-bldg-viol">
        {facts.open.total ? <>⚠️ {facts.open.total} open HPD violation{facts.open.total === 1 ? "" : "s"}: <b>{facts.open.C} C</b> (hazardous) · {facts.open.B} B · {facts.open.A} A</> : "✓ No open HPD violations"}
      </p>
      {facts.related.length ? (
        <>
          <small className="fc-bldg-sub">Open violations that match this work:</small>
          <ul className="fc-bldg-related" data-hpd-smoke="fc-bldg-related">
            {facts.related.map((r, i) => (
              <li key={i} className={`is-${r.cls.toLowerCase()}`}>
                <b>{r.cls}</b>
                <span>{r.apt ? `Apt ${r.apt} · ` : ""}{r.day ? `${r.day} · ` : ""}{r.text}</span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {facts.hpdBuildingId ? <a className="fc-bldg-link" href={`https://hpdonline.nyc.gov/hpdonline/building/${facts.hpdBuildingId}`} target="_blank" rel="noopener noreferrer">All violations and complaints on HPD Online →</a> : null}
    </section>
  );
}
