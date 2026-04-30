"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type JobRecord = {
  id?: string;
  address?: string;
  location?: string;
  borough?: string;
  status?: string;
  trade?: string;
  awardDate?: string;
  bidAmount?: string;
  amountValue?: number;
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

function cleanAddress(job: JobRecord) {
  const raw = job.address || job.location || "";
  if (!raw.trim()) return "";

  const hasNY = /ny|new york/i.test(raw);
  const hasBorough = Boolean(job.borough && raw.toLowerCase().includes(job.borough.toLowerCase()));

  return [
    raw,
    hasBorough ? "" : job.borough || "",
    hasNY ? "" : "New York",
  ]
    .filter(Boolean)
    .join(", ")
    .replace(/\s+/g, " ")
    .trim();
}

function cacheKey(job: JobRecord) {
  return `hpd_geo_${job.id || ""}_${cleanAddress(job)}`.toLowerCase();
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

  const filteredJobs = useMemo(() => {
    const needle = search.trim().toLowerCase();

    const rows = mappedJobs.length
      ? mappedJobs
      : jobs.map((job) => {
          const coords = getStoredCoords(job);
          return coords ? { ...job, _lat: coords.lat, _lng: coords.lng, _source: "stored" as const } : job;
        });

    if (!needle) return rows;

    return rows.filter((job) =>
      [
        job.id,
        job.address,
        job.location,
        job.borough,
        job.trade,
        job.status,
        job.awardDate,
        job.bidAmount,
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

        const data = await response.json();
        const rows = asArray(data);

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

        setMessage(`${rows.length} jobs loaded. ${existing} mapped. ${missing} need address lookup.`);

        const toGeocode = initialMapped
          .filter((job) => !Number.isFinite(job._lat) || !Number.isFinite(job._lng))
          .filter((job) => cleanAddress(job))
          .slice(0, 80);

        let geocoded = 0;

        for (const job of toGeocode) {
          if (cancelled) return;

          await wait(1100);

          const coords = await geocodeJob(job).catch(() => null);
          if (!coords) continue;

          geocoded += 1;

          setMappedJobs((current) =>
            current.map((item) => {
              const sameId = item.id && job.id && item.id === job.id;
              const sameAddress = !item.id && !job.id && cleanAddress(item) === cleanAddress(job);

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

          setMessage(`${rows.length} jobs loaded. Geocoded ${geocoded} more for mobile map.`);
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

        setTimeout(() => {
          try {
            map.invalidateSize();
          } catch {}
        }, 250);

        setTimeout(() => {
          try {
            map.invalidateSize();
          } catch {}
        }, 1000);
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

      filteredJobs.forEach((job) => {
        if (!Number.isFinite(job._lat) || !Number.isFinite(job._lng)) return;

        const lat = Number(job._lat);
        const lng = Number(job._lng);

        const color =
          (job.status || "").toLowerCase().includes("award")
            ? "#53e69c"
            : job._source === "geocoded"
              ? "#ffd166"
              : "#42e8f3";

        const marker = L.circleMarker([lat, lng], {
          radius: 9,
          weight: 2,
          color,
          fillColor: color,
          fillOpacity: 0.8,
        });

        marker.on("click", () => {
          setSelected(job);
          setDrawerOpen(true);
        });

        marker.bindPopup(`
          <div style="min-width:190px">
            <strong>${job.id || "HPD Job"}</strong><br/>
            ${job.address || job.location || "No address"}<br/>
            ${job.borough || ""}<br/>
            ${job.trade || ""}<br/>
            ${job.status || ""}
          </div>
        `);

        marker.addTo(layer);
        bounds.push([lat, lng]);
      });

      if (bounds.length) {
        map.fitBounds(bounds, {
          padding: [28, 28],
          maxZoom: 15,
        });
      } else {
        map.setView([40.7128, -74.006], 10);
      }

      setTimeout(() => {
        try {
          map.invalidateSize();
        } catch {}
      }, 250);
    }

    drawMarkers();
  }, [mapReady, filteredJobs]);

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
          grid-template-rows: auto 1fr auto;
          background:
            radial-gradient(circle at top right, rgba(66, 232, 243, 0.14), transparent 24rem),
            linear-gradient(180deg, #07111f 0%, #050914 100%);
          overflow: hidden;
        }

        .map-topbar {
          z-index: 5;
          padding: max(12px, env(safe-area-inset-top)) 12px 10px;
          display: grid;
          gap: 10px;
          background: rgba(7, 17, 31, 0.92);
          border-bottom: 1px solid rgba(255, 255, 255, 0.12);
          backdrop-filter: blur(14px);
        }

        .map-heading {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
        }

        .map-heading h1 {
          margin: 0;
          font-size: clamp(22px, 6vw, 36px);
          letter-spacing: -0.06em;
          line-height: 1;
        }

        .map-heading p {
          margin: 4px 0 0;
          color: #aebbd0;
          font-size: 12px;
          line-height: 1.3;
        }

        .home-button {
          flex: 0 0 auto;
          border: 1px solid rgba(255, 255, 255, 0.14);
          background: rgba(255, 255, 255, 0.08);
          color: #f8fbff;
          border-radius: 999px;
          padding: 10px 12px;
          font-weight: 900;
          font-size: 13px;
        }

        .search-row {
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 8px;
        }

        .search-row input {
          width: 100%;
          min-height: 46px;
          border: 1px solid rgba(255, 255, 255, 0.14);
          border-radius: 14px;
          background: rgba(255, 255, 255, 0.08);
          color: #f8fbff;
          padding: 0 12px;
          font-size: 16px;
          outline: none;
        }

        .drawer-toggle {
          min-height: 46px;
          border: 1px solid rgba(255, 255, 255, 0.14);
          border-radius: 14px;
          background: linear-gradient(135deg, #42e8f3, #47a3ff);
          color: #04111f;
          font-weight: 950;
          padding: 0 12px;
        }

        .map-stage {
          position: relative;
          min-height: 0;
          height: 100%;
          width: 100%;
        }

        .map-node {
          position: absolute;
          inset: 0;
          height: 100%;
          width: 100%;
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

        .stat {
          border: 1px solid rgba(255, 255, 255, 0.14);
          background: rgba(7, 17, 31, 0.85);
          backdrop-filter: blur(12px);
          border-radius: 16px;
          padding: 10px;
          box-shadow: 0 12px 36px rgba(0, 0, 0, 0.25);
        }

        .stat strong {
          display: block;
          font-size: 18px;
          line-height: 1;
        }

        .stat span {
          display: block;
          margin-top: 4px;
          color: #aebbd0;
          font-size: 11px;
          font-weight: 800;
        }

        .job-drawer {
          z-index: 6;
          max-height: 45dvh;
          background: rgba(7, 17, 31, 0.96);
          border-top: 1px solid rgba(255, 255, 255, 0.14);
          border-radius: 22px 22px 0 0;
          padding: 12px;
          padding-bottom: max(12px, env(safe-area-inset-bottom));
          overflow: auto;
          box-shadow: 0 -20px 70px rgba(0, 0, 0, 0.38);
        }

        .job-drawer.closed {
          max-height: 64px;
          overflow: hidden;
        }

        .drawer-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          margin-bottom: 10px;
        }

        .drawer-head strong {
          font-size: 16px;
        }

        .drawer-head button {
          border: 1px solid rgba(255, 255, 255, 0.14);
          background: rgba(255, 255, 255, 0.08);
          color: #f8fbff;
          border-radius: 999px;
          padding: 8px 10px;
          font-weight: 900;
        }

        .selected-card,
        .job-card {
          border: 1px solid rgba(255, 255, 255, 0.14);
          background: rgba(255, 255, 255, 0.08);
          border-radius: 16px;
          padding: 12px;
          margin-bottom: 8px;
        }

        .selected-card {
          background: rgba(66, 232, 243, 0.12);
          border-color: rgba(66, 232, 243, 0.35);
        }

        .job-row {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 10px;
        }

        .job-card button {
          width: 100%;
          border: 0;
          background: transparent;
          color: inherit;
          padding: 0;
          text-align: left;
        }

        .job-card strong,
        .selected-card strong {
          display: block;
          font-size: 14px;
        }

        .job-card p,
        .selected-card p {
          margin: 4px 0 0;
          color: #aebbd0;
          line-height: 1.35;
          font-size: 12px;
        }

        .status {
          flex: 0 0 auto;
          max-width: 92px;
          border-radius: 999px;
          padding: 5px 7px;
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

        @media (min-width: 850px) {
          .map-shell {
            grid-template-columns: 380px 1fr;
            grid-template-rows: auto 1fr;
          }

          .map-topbar {
            grid-column: 1 / -1;
          }

          .map-stage {
            grid-column: 2;
            grid-row: 2;
          }

          .job-drawer {
            grid-column: 1;
            grid-row: 2;
            max-height: none;
            height: 100%;
            border-radius: 0;
            border-top: 0;
            border-right: 1px solid rgba(255, 255, 255, 0.14);
          }

          .job-drawer.closed {
            max-height: none;
          }
        }
      `}</style>

      <header className="map-topbar">
        <div className="map-heading">
          <div>
            <h1>Mobile Job Map</h1>
            <p>{message}</p>
          </div>
          <a className="home-button" href="/">Home</a>
        </div>

        <div className="search-row">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search OMO, address, borough, trade..."
          />
          <button className="drawer-toggle" type="button" onClick={() => setDrawerOpen((v) => !v)}>
            Jobs
          </button>
        </div>
      </header>

      <section className="map-stage">
        <div ref={mapNode} className="map-node" />

        <div className="map-stats">
          <div className="stat">
            <strong>{jobs.length}</strong>
            <span>Total</span>
          </div>
          <div className="stat">
            <strong>{plottedCount}</strong>
            <span>Mapped</span>
          </div>
          <div className="stat">
            <strong>{Math.max(0, jobs.length - plottedCount)}</strong>
            <span>Unmapped</span>
          </div>
        </div>
      </section>

      <aside className={`job-drawer ${drawerOpen ? "" : "closed"}`}>
        <div className="drawer-head">
          <strong>{filteredJobs.length} jobs</strong>
          <button type="button" onClick={() => setDrawerOpen((v) => !v)}>
            {drawerOpen ? "Hide" : "Show"}
          </button>
        </div>

        {selected ? (
          <div className="selected-card">
            <strong>{selected.id || "Selected job"}</strong>
            <p>{selected.address || selected.location || "No address listed"}</p>
            <p>{selected.borough || "Unknown borough"} · {selected.trade || "Trade not listed"}</p>
            <p>{selected.status || "No status"} {money(selected) ? `· ${money(selected)}` : ""}</p>
          </div>
        ) : null}

        {filteredJobs.slice(0, 250).map((job, index) => (
          <div className="job-card" key={`${job.id || "job"}-${index}`}>
            <button
              type="button"
              onClick={() => {
                setSelected(job);
                if (Number.isFinite(job._lat) && Number.isFinite(job._lng) && mapRef.current) {
                  mapRef.current.setView([Number(job._lat), Number(job._lng)], 16);
                }
              }}
            >
              <div className="job-row">
                <div>
                  <strong>{job.id || "HPD Job"}</strong>
                  <p>{job.address || job.location || "No address listed"}</p>
                  <p>{job.borough || "Unknown borough"} · {job.trade || "Trade not listed"}</p>
                </div>
                <span className={`status ${statusClass(job.status)}`}>{job.status || "Status"}</span>
              </div>
            </button>
          </div>
        ))}
      </aside>
    </main>
  );
}
