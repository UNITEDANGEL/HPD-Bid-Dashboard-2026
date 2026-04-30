"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type JobRecord = {
  id?: string;
  omo?: string;
  jobId?: string;
  address?: string;
  location?: string;
  borough?: string;
  status?: string;
  trade?: string;
  awardDate?: string;
  dueDate?: string;
  bidDueDate?: string;
  bidAmount?: string;
  amountValue?: number;
  tenantPhone?: string;
  phone?: string;
  contractor?: string;
  owner?: string;
  description?: string;
  coaFile?: string;
  itbFile?: string;
  pdfFile?: string;
  latitude?: number | string;
  longitude?: number | string;
  lat?: number | string;
  lng?: number | string;
  lon?: number | string;
};

type MappedJob = JobRecord & {
  _lat?: number;
  _lng?: number;
  _source?: "stored" | "geocoded";
};

function asArray(value: unknown): JobRecord[] {
  if (Array.isArray(value)) return value as JobRecord[];

  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (Array.isArray(obj.jobs)) return obj.jobs as JobRecord[];
    if (Array.isArray(obj.data)) return obj.data as JobRecord[];
    if (Array.isArray(obj.records)) return obj.records as JobRecord[];
  }

  return [];
}

function toNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getStoredCoords(job: JobRecord) {
  const lat = toNumber(job.latitude ?? job.lat);
  const lng = toNumber(job.longitude ?? job.lng ?? job.lon);

  if (lat === null || lng === null) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;

  return { lat, lng };
}

function jobKey(job: JobRecord, index?: number) {
  return job.id || job.omo || job.jobId || `JOB-${index ?? ""}`;
}

function displayAddress(job: JobRecord) {
  return job.address || job.location || "No address listed";
}

function cleanAddress(job: JobRecord) {
  const raw = job.address || job.location || "";
  if (!raw.trim()) return "";

  const parts = [raw];

  if (job.borough && !raw.toLowerCase().includes(job.borough.toLowerCase())) {
    parts.push(job.borough);
  }

  if (!/ny|new york/i.test(raw)) {
    parts.push("New York");
  }

  return parts.filter(Boolean).join(", ").replace(/\s+/g, " ").trim();
}

function cacheKey(job: JobRecord) {
  return `hpd_geo_${jobKey(job)}_${cleanAddress(job)}`.toLowerCase();
}

function money(job: JobRecord) {
  if (typeof job.amountValue === "number" && Number.isFinite(job.amountValue) && job.amountValue > 0) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(job.amountValue);
  }

  return job.bidAmount || "";
}

function phone(job: JobRecord) {
  return job.tenantPhone || job.phone || "";
}

function statusClass(status?: string) {
  const value = (status || "").toLowerCase();
  if (value.includes("award")) return "good";
  if (value.includes("open") || value.includes("new")) return "hot";
  if (value.includes("pending")) return "warn";
  return "neutral";
}

async function wait(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function geocodeJob(job: JobRecord) {
  const query = cleanAddress(job);
  if (!query) return null;

  const key = cacheKey(job);

  try {
    const cached = localStorage.getItem(key);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Number.isFinite(parsed.lat) && Number.isFinite(parsed.lng)) {
        return { lat: parsed.lat, lng: parsed.lng };
      }
    }
  } catch {}

  const url =
    "https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=us&q=" +
    encodeURIComponent(query);

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) return null;

  const data = await response.json();
  const first = Array.isArray(data) ? data[0] : null;

  if (!first) return null;

  const lat = Number(first.lat);
  const lng = Number(first.lon);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  try {
    localStorage.setItem(key, JSON.stringify({ lat, lng, query }));
  } catch {}

  return { lat, lng };
}

export default function MapClient() {
  const mapNode = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const markerLayerRef = useRef<any>(null);

  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [mappedJobs, setMappedJobs] = useState<MappedJob[]>([]);
  const [selected, setSelected] = useState<MappedJob | null>(null);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("Loading jobs...");
  const [mapReady, setMapReady] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(true);

  const filteredJobs = useMemo<MappedJob[]>(() => {
    const needle = search.trim().toLowerCase();

    const rows: MappedJob[] = mappedJobs.length
      ? mappedJobs
      : jobs.map((job) => {
          const coords = getStoredCoords(job);
          return coords
            ? { ...job, _lat: coords.lat, _lng: coords.lng, _source: "stored" }
            : { ...job };
        });

    if (!needle) return rows;

    return rows.filter((job) =>
      [
        job.id,
        job.omo,
        job.jobId,
        job.address,
        job.location,
        job.borough,
        job.trade,
        job.status,
        job.awardDate,
        job.bidDueDate,
        job.dueDate,
        job.bidAmount,
        job.tenantPhone,
        job.phone,
        job.contractor,
        job.owner,
        job.description,
      ]
        .join(" ")
        .toLowerCase()
        .includes(needle)
    );
  }, [jobs, mappedJobs, search]);

  const plottedCount = mappedJobs.filter((job) => Number.isFinite(job._lat) && Number.isFinite(job._lng)).length;

  useEffect(() => {
    let cancelled = false;

    async function loadJobs() {
      try {
        const response = await fetch("/api/jobs", { cache: "no-store" });
        if (!response.ok) throw new Error(`/api/jobs returned ${response.status}`);

        const rows = asArray(await response.json());

        if (cancelled) return;

        setJobs(rows);

        const initialMapped: MappedJob[] = rows.map((job) => {
          const coords = getStoredCoords(job);
          if (!coords) return { ...job };
          return { ...job, _lat: coords.lat, _lng: coords.lng, _source: "stored" };
        });

        setMappedJobs(initialMapped);

        const existing = initialMapped.filter((job) => Number.isFinite(job._lat) && Number.isFinite(job._lng)).length;
        const missing = rows.length - existing;

        setMessage(`${rows.length} jobs · ${existing} mapped · ${missing} need lookup`);

        const toGeocode = initialMapped
          .filter((job) => !Number.isFinite(job._lat) || !Number.isFinite(job._lng))
          .filter((job) => cleanAddress(job))
          .slice(0, 100);

        let geocoded = 0;

        for (const job of toGeocode) {
          if (cancelled) return;

          await wait(1050);

          const coords = await geocodeJob(job).catch(() => null);
          if (!coords) continue;

          geocoded += 1;

          setMappedJobs((current) =>
            current.map((item) => {
              const sameId = jobKey(item) === jobKey(job);
              const sameAddress = cleanAddress(item) === cleanAddress(job);

              if (sameId || sameAddress) {
                return {
                  ...item,
                  _lat: coords.lat,
                  _lng: coords.lng,
                  _source: "geocoded",
                };
              }

              return item;
            })
          );

          setMessage(`${rows.length} jobs · ${existing + geocoded} mapped · geocoding continues`);
        }
      } catch (error) {
        console.error(error);
        if (!cancelled) {
          setJobs([]);
          setMappedJobs([]);
          setMessage("Could not load /api/jobs. Showing NYC map only.");
        }
      }
    }

    loadJobs();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function initMap() {
      if (!mapNode.current || mapRef.current) return;

      try {
        const L = await import("leaflet");

        if (cancelled || !mapNode.current) return;

        const map = L.map(mapNode.current, {
          zoomControl: true,
          attributionControl: true,
          preferCanvas: true,
        }).setView([40.7128, -74.006], 10);

        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution: '&copy; OpenStreetMap contributors',
        }).addTo(map);

        const markerLayer = L.layerGroup().addTo(map);

        mapRef.current = map;
        markerLayerRef.current = markerLayer;

        setMapReady(true);

        setTimeout(() => map.invalidateSize(), 250);
        setTimeout(() => map.invalidateSize(), 1000);
      } catch (error) {
        console.error(error);
        if (!cancelled) setMessage("Map failed to initialize.");
      }
    }

    initMap();

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        markerLayerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    async function drawMarkers() {
      if (!mapReady || !mapRef.current || !markerLayerRef.current) return;

      const L = await import("leaflet");
      const map = mapRef.current;
      const layer = markerLayerRef.current;

      layer.clearLayers();

      const bounds: [number, number][] = [];

      filteredJobs.forEach((job, index) => {
        if (!Number.isFinite(job._lat) || !Number.isFinite(job._lng)) return;

        const lat = Number(job._lat);
        const lng = Number(job._lng);

        const color = (job.status || "").toLowerCase().includes("award")
          ? "#53e69c"
          : job._source === "geocoded"
            ? "#ffd166"
            : "#42e8f3";

        const marker = L.circleMarker([lat, lng], {
          radius: 10,
          weight: 3,
          color: "#06101f",
          fillColor: color,
          fillOpacity: 0.92,
        });

        marker.on("click", () => {
          setSelected(job);
          setDrawerOpen(true);
        });

        marker.bindPopup(`
          <div style="min-width:210px">
            <strong>${jobKey(job, index)}</strong><br/>
            ${displayAddress(job)}<br/>
            ${job.borough || ""} ${job.trade ? "· " + job.trade : ""}<br/>
            ${job.status || ""} ${money(job) ? "· " + money(job) : ""}
          </div>
        `);

        marker.addTo(layer);
        bounds.push([lat, lng]);
      });

      if (bounds.length) {
        map.fitBounds(bounds, {
          padding: [34, 34],
          maxZoom: 15,
        });
      } else {
        map.setView([40.7128, -74.006], 10);
      }

      setTimeout(() => map.invalidateSize(), 250);
    }

    drawMarkers();
  }, [mapReady, filteredJobs]);

  function focusJob(job: MappedJob) {
    setSelected(job);
    setDrawerOpen(true);

    if (Number.isFinite(job._lat) && Number.isFinite(job._lng) && mapRef.current) {
      mapRef.current.setView([Number(job._lat), Number(job._lng)], 16);
    }
  }

  function directionsUrl(job: JobRecord) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(displayAddress(job))}`;
  }

  return (
    <main className="map-shell">
      <style jsx global>{`
        html,
        body {
          margin: 0;
          min-height: 100%;
          background: #06101f;
          color: #f8fbff;
          font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }

        * {
          box-sizing: border-box;
        }

        a {
          color: inherit;
          text-decoration: none;
        }

        .leaflet-container {
          width: 100%;
          height: 100%;
          min-height: 100%;
          background: #0d1826;
          color: #111827;
          z-index: 1;
        }

        .map-shell {
          height: 100dvh;
          width: 100%;
          display: grid;
          grid-template-rows: auto minmax(0, 1fr) auto;
          background: #07111f;
          overflow: hidden;
        }

        .map-top {
          z-index: 5;
          padding: max(9px, env(safe-area-inset-top)) 10px 9px;
          display: grid;
          gap: 8px;
          background: rgba(7, 17, 31, 0.95);
          border-bottom: 1px solid rgba(255, 255, 255, 0.12);
          backdrop-filter: blur(14px);
        }

        .map-title-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 10px;
        }

        .map-title-row h1 {
          margin: 0;
          font-size: clamp(21px, 6vw, 34px);
          letter-spacing: -0.06em;
          line-height: 1;
        }

        .map-title-row p {
          margin: 3px 0 0;
          color: #aebbd0;
          font-size: 11px;
          line-height: 1.25;
        }

        .home-btn {
          border: 1px solid rgba(255, 255, 255, 0.14);
          background: rgba(255, 255, 255, 0.08);
          color: #f8fbff;
          border-radius: 999px;
          padding: 9px 11px;
          font-weight: 950;
          font-size: 12px;
        }

        .map-search {
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 8px;
        }

        .map-search input {
          width: 100%;
          min-height: 42px;
          border: 1px solid rgba(255, 255, 255, 0.14);
          border-radius: 14px;
          background: rgba(255, 255, 255, 0.08);
          color: #f8fbff;
          padding: 0 12px;
          font-size: 16px;
          outline: none;
        }

        .jobs-toggle {
          min-height: 42px;
          border: 0;
          border-radius: 14px;
          background: linear-gradient(135deg, #42e8f3, #47a3ff);
          color: #04111f;
          font-weight: 950;
          padding: 0 13px;
        }

        .map-stage {
          position: relative;
          height: 100%;
          min-height: 0;
          width: 100%;
        }

        .map-node {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
        }

        .map-stats {
          position: absolute;
          z-index: 4;
          left: 10px;
          right: 10px;
          top: 10px;
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 8px;
          pointer-events: none;
        }

        .map-stat {
          border: 1px solid rgba(255, 255, 255, 0.14);
          background: rgba(7, 17, 31, 0.82);
          backdrop-filter: blur(12px);
          border-radius: 15px;
          padding: 9px;
        }

        .map-stat strong {
          display: block;
          font-size: 17px;
          line-height: 1;
        }

        .map-stat span {
          display: block;
          margin-top: 4px;
          color: #aebbd0;
          font-size: 10px;
          font-weight: 900;
        }

        .job-drawer {
          z-index: 6;
          max-height: 46dvh;
          background: rgba(7, 17, 31, 0.98);
          border-top: 1px solid rgba(255, 255, 255, 0.14);
          border-radius: 22px 22px 0 0;
          padding: 12px;
          padding-bottom: max(12px, env(safe-area-inset-bottom));
          overflow: auto;
          box-shadow: 0 -20px 70px rgba(0, 0, 0, 0.42);
        }

        .job-drawer.closed {
          max-height: 62px;
          overflow: hidden;
        }

        .drawer-head {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 10px;
          margin-bottom: 10px;
        }

        .drawer-head strong {
          font-size: 18px;
        }

        .drawer-head button {
          border: 1px solid rgba(255, 255, 255, 0.14);
          background: rgba(255, 255, 255, 0.08);
          color: #f8fbff;
          border-radius: 999px;
          padding: 8px 11px;
          font-weight: 950;
        }

        .selected-card,
        .job-card {
          border: 1px solid rgba(255, 255, 255, 0.14);
          background: rgba(255, 255, 255, 0.08);
          border-radius: 20px;
          padding: 15px;
          margin-bottom: 10px;
        }

        .selected-card {
          background: linear-gradient(145deg, rgba(66, 232, 243, 0.16), rgba(71, 163, 255, 0.1));
          border-color: rgba(66, 232, 243, 0.38);
        }

        .job-main-row {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 12px;
        }

        .job-title {
          display: block;
          font-size: 18px;
          letter-spacing: -0.035em;
        }

        .job-address {
          margin: 7px 0 0;
          color: #f8fbff;
          font-size: 15px;
          line-height: 1.35;
        }

        .job-sub {
          margin: 5px 0 0;
          color: #aebbd0;
          font-size: 13px;
          line-height: 1.35;
        }

        .status {
          flex: 0 0 auto;
          max-width: 110px;
          border-radius: 999px;
          padding: 6px 8px;
          font-size: 10px;
          font-weight: 950;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .status.good {
          background: rgba(83, 230, 156, 0.16);
          color: #baffd8;
        }

        .status.hot {
          background: rgba(66, 232, 243, 0.14);
          color: #c4fbff;
        }

        .status.warn {
          background: rgba(255, 209, 102, 0.14);
          color: #ffe7a3;
        }

        .status.neutral {
          background: rgba(255, 255, 255, 0.09);
          color: #d7e4f8;
        }

        .detail-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 8px;
          margin-top: 12px;
        }

        .detail {
          border: 1px solid rgba(255, 255, 255, 0.1);
          background: rgba(255, 255, 255, 0.065);
          border-radius: 13px;
          padding: 10px;
          min-width: 0;
        }

        .detail span {
          display: block;
          color: #aebbd0;
          font-size: 10px;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }

        .detail strong {
          display: block;
          margin-top: 4px;
          color: #f8fbff;
          font-size: 13px;
          line-height: 1.25;
          overflow-wrap: anywhere;
        }

        .card-actions {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 8px;
          margin-top: 12px;
        }

        .card-actions a,
        .card-actions button {
          min-height: 40px;
          display: grid;
          place-items: center;
          border: 0;
          border-radius: 14px;
          background: linear-gradient(135deg, #42e8f3, #47a3ff);
          color: #04111f;
          font-weight: 950;
          font-size: 12px;
          text-align: center;
        }

        .card-actions .secondary {
          background: rgba(255, 255, 255, 0.1);
          color: #f8fbff;
          border: 1px solid rgba(255, 255, 255, 0.12);
        }

        .job-card-button {
          width: 100%;
          border: 0;
          background: transparent;
          color: inherit;
          padding: 0;
          text-align: left;
        }

        @media (min-width: 920px) {
          .map-shell {
            grid-template-columns: 430px minmax(0, 1fr);
            grid-template-rows: auto minmax(0, 1fr);
          }

          .map-top {
            grid-column: 1 / -1;
          }

          .job-drawer {
            grid-column: 1;
            grid-row: 2;
            height: 100%;
            max-height: none;
            border-radius: 0;
            border-top: 0;
            border-right: 1px solid rgba(255, 255, 255, 0.14);
          }

          .job-drawer.closed {
            max-height: none;
          }

          .map-stage {
            grid-column: 2;
            grid-row: 2;
          }
        }

        @media (max-width: 520px) {
          .map-stats {
            grid-template-columns: repeat(3, 1fr);
          }

          .detail-grid {
            grid-template-columns: 1fr;
          }

          .card-actions {
            grid-template-columns: 1fr;
          }

          .job-drawer {
            max-height: 50dvh;
          }
        }
      `}</style>

      <header className="map-top">
        <div className="map-title-row">
          <div>
            <h1>All Jobs Map</h1>
            <p>{message}</p>
          </div>
          <a className="home-btn" href="/">Home</a>
        </div>

        <div className="map-search">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search OMO, address, borough, trade..."
          />
          <button className="jobs-toggle" type="button" onClick={() => setDrawerOpen((value) => !value)}>
            Jobs
          </button>
        </div>
      </header>

      <section className="map-stage">
        <div ref={mapNode} className="map-node" />

        <div className="map-stats">
          <div className="map-stat">
            <strong>{jobs.length}</strong>
            <span>Total</span>
          </div>
          <div className="map-stat">
            <strong>{plottedCount}</strong>
            <span>Mapped</span>
          </div>
          <div className="map-stat">
            <strong>{Math.max(0, jobs.length - plottedCount)}</strong>
            <span>Need geo</span>
          </div>
        </div>
      </section>

      <aside className={`job-drawer ${drawerOpen ? "" : "closed"}`}>
        <div className="drawer-head">
          <strong>{filteredJobs.length} jobs</strong>
          <button type="button" onClick={() => setDrawerOpen((value) => !value)}>
            {drawerOpen ? "Hide Cards" : "Show Cards"}
          </button>
        </div>

        {selected ? (
          <div className="selected-card">
            <div className="job-main-row">
              <div>
                <strong className="job-title">{jobKey(selected)}</strong>
                <p className="job-address">{displayAddress(selected)}</p>
                <p className="job-sub">{selected.borough || "Unknown borough"} · {selected.trade || "Trade not listed"}</p>
              </div>
              <span className={`status ${statusClass(selected.status)}`}>{selected.status || "Status"}</span>
            </div>

            <div className="detail-grid">
              <div className="detail"><span>Amount</span><strong>{money(selected) || "Not listed"}</strong></div>
              <div className="detail"><span>Award Date</span><strong>{selected.awardDate || "Not listed"}</strong></div>
              <div className="detail"><span>Due Date</span><strong>{selected.bidDueDate || selected.dueDate || "Not listed"}</strong></div>
              <div className="detail"><span>Phone</span><strong>{phone(selected) || "Not listed"}</strong></div>
              <div className="detail"><span>Contractor</span><strong>{selected.contractor || "Not listed"}</strong></div>
              <div className="detail"><span>Owner</span><strong>{selected.owner || "Not listed"}</strong></div>
              <div className="detail"><span>Docs</span><strong>{[selected.coaFile ? "COA ✓" : "", selected.itbFile ? "ITB ✓" : "", selected.pdfFile ? "PDF ✓" : ""].filter(Boolean).join(" ") || "Not listed"}</strong></div>
              <div className="detail"><span>Map Source</span><strong>{selected._source || "unmapped"}</strong></div>
            </div>

            {selected.description ? <p className="job-sub">{selected.description}</p> : null}

            <div className="card-actions">
              <a href={`/jobs/${encodeURIComponent(jobKey(selected))}`}>Open Job</a>
              <a href={`/invoice-generator?job=${encodeURIComponent(jobKey(selected))}`}>Invoice</a>
              <a target="_blank" rel="noreferrer" href={directionsUrl(selected)}>Directions</a>
            </div>
          </div>
        ) : null}

        {filteredJobs.slice(0, 300).map((job, index) => (
          <div className="job-card" key={`${jobKey(job, index)}-${index}`}>
            <button className="job-card-button" type="button" onClick={() => focusJob(job)}>
              <div className="job-main-row">
                <div>
                  <strong className="job-title">{jobKey(job, index)}</strong>
                  <p className="job-address">{displayAddress(job)}</p>
                  <p className="job-sub">{job.borough || "Unknown borough"} · {job.trade || "Trade not listed"}</p>
                </div>
                <span className={`status ${statusClass(job.status)}`}>{job.status || "Status"}</span>
              </div>

              <div className="detail-grid">
                <div className="detail"><span>Amount</span><strong>{money(job) || "Not listed"}</strong></div>
                <div className="detail"><span>Award</span><strong>{job.awardDate || "Not listed"}</strong></div>
                <div className="detail"><span>Due</span><strong>{job.bidDueDate || job.dueDate || "Not listed"}</strong></div>
                <div className="detail"><span>Docs</span><strong>{[job.coaFile ? "COA ✓" : "", job.itbFile ? "ITB ✓" : "", job.pdfFile ? "PDF ✓" : ""].filter(Boolean).join(" ") || "Not listed"}</strong></div>
              </div>
            </button>

            <div className="card-actions">
              <a className="secondary" href={`/jobs/${encodeURIComponent(jobKey(job, index))}`}>Open</a>
              <a className="secondary" href={`/invoice-generator?job=${encodeURIComponent(jobKey(job, index))}`}>Invoice</a>
              <a target="_blank" rel="noreferrer" href={directionsUrl(job)}>Directions</a>
            </div>
          </div>
        ))}
      </aside>
    </main>
  );
}

