"use client";
import { useEffect, useMemo, useRef, useState } from "react";
type JobRecord = Record<string, unknown>;
function value(job: JobRecord, keys: string[]) {
  for (const key of keys) {
    const v = job[key];
    if (v !== null && v !== undefined && String(v).trim()) return String(v).trim();
  }
  return "";
}
function numberValue(job: JobRecord, keys: string[]) {
  for (const key of keys) {
    const n = Number(job[key]);
    if (Number.isFinite(n)) return n;
  }
  return NaN;
}
function jobId(job: JobRecord) {
  return value(job, ["OMO", "omo", "OMONumber", "id", "Id"]) || "HPD JOB";
}
function jobAddress(job: JobRecord) {
  return value(job, ["BuildingAddress", "Address", "address", "Location", "location"]) || "Address not captured";
}
function jobBorough(job: JobRecord) {
  const raw = value(job, ["Borough", "borough", "Boro", "boro"]).toUpperCase();
  if (raw.includes("BROOKLYN") || raw === "BK") return "BK";
  if (raw.includes("MANHATTAN") || raw === "MN") return "MN";
  if (raw.includes("BRONX") || raw === "BX") return "BX";
  if (raw.includes("QUEENS") || raw === "QN") return "QN";
  if (raw.includes("STATEN") || raw === "SI") return "SI";
  const zip = jobAddress(job).match(/\b\d{5}\b/)?.[0] || "";
  const z = Number(zip);
  if (z >= 10001 && z <= 10282) return "MN";
  if (z >= 10451 && z <= 10475) return "BX";
  if (z >= 11201 && z <= 11256) return "BK";
  if ((z >= 11004 && z <= 11109) || (z >= 11351 && z <= 11697)) return "QN";
  if (z >= 10301 && z <= 10314) return "SI";
  return "NYC";
}
function jobStatus(job: JobRecord) {
  return value(job, ["WorkflowStatus", "Status", "status", "JobStatus"]) || "Active";
}
function jobAmount(job: JobRecord) {
  const raw = value(job, ["AwardAmount", "COAAwardAmount", "Amount", "amount"]);
  const n = Number(raw.replace(/[$,]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : 0;
}
function jobLatLng(job: JobRecord) {
  const lat = numberValue(job, ["Latitude", "latitude", "Lat", "lat", "_lat"]);
  const lng = numberValue(job, ["Longitude", "longitude", "Lng", "lng", "Lon", "lon", "_lng"]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < 40 || lat > 41 || lng > -73 || lng < -75) return null;
  return { lat, lng };
}
function statusClass(status: string) {
  const s = status.toLowerCase();
  if (s.includes("complete")) return "complete";
  if (s.includes("no access")) return "noaccess";
  if (s.includes("refused")) return "refused";
  if (s.includes("partial")) return "partial";
  return "active";
}
export default function FieldMapClient() {
  const mapNode = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const layerRef = useRef<any>(null);
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [selected, setSelected] = useState<JobRecord | null>(null);
  const [mode, setMode] = useState<"desktop" | "iphone">("iphone");
  const [search, setSearch] = useState("");
  useEffect(() => {
    fetch("/data/COA_Fetcher_2026.json")
      .then((r) => r.json())
      .then((data) => {
        const rows = Array.isArray(data) ? data : data.jobs || data.data || data.records || [];
        setJobs(rows);
        const firstMapped = rows.find((job: JobRecord) => jobLatLng(job));
        setSelected(firstMapped || rows[0] || null);
      })
      .catch(() => setJobs([]));
  }, []);
  const mappedJobs = useMemo(() => jobs.filter((job) => jobLatLng(job)), [jobs]);
  const filteredJobs = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return mappedJobs;
    return mappedJobs.filter((job) => {
      return [
        jobId(job),
        jobAddress(job),
        jobBorough(job),
        jobStatus(job),
        value(job, ["TenantName", "Tenant", "Summary", "JobDescription"]),
      ].join(" ").toLowerCase().includes(q);
    });
  }, [mappedJobs, search]);
  const boroughCounts = useMemo(() => {
    const counts: Record<string, number> = { BK: 0, MN: 0, BX: 0, QN: 0, SI: 0 };
    mappedJobs.forEach((job) => {
      const b = jobBorough(job);
      if (counts[b] !== undefined) counts[b] += 1;
    });
    return counts;
  }, [mappedJobs]);
  const totalAward = useMemo(() => jobs.reduce((sum, job) => sum + jobAmount(job), 0), [jobs]);
  useEffect(() => {
    let cancelled = false;
    async function drawMap() {
      if (!mapNode.current || !filteredJobs.length) return;
      const leafletModule = await import("leaflet");
      const L = (leafletModule as any).default || leafletModule;
      if (cancelled || !mapNode.current) return;
      if (!mapRef.current) {
        mapRef.current = L.map(mapNode.current, {
          zoomControl: false,
          attributionControl: false,
        }).setView([40.7128, -74.006], 10);
        L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
          maxZoom: 20,
        }).addTo(mapRef.current);
        L.control.zoom({ position: "bottomright" }).addTo(mapRef.current);
      }
      if (layerRef.current) {
        layerRef.current.clearLayers();
      } else {
        layerRef.current = L.layerGroup().addTo(mapRef.current);
      }
      const bounds: any[] = [];
      filteredJobs.forEach((job) => {
        const ll = jobLatLng(job);
        if (!ll) return;
        const status = statusClass(jobStatus(job));
        const color =
          status === "complete" ? "#22c55e" :
          status === "noaccess" ? "#f59e0b" :
          status === "refused" ? "#ef4444" :
          status === "partial" ? "#a855f7" :
          "#38bdf8";
        const marker = L.circleMarker([ll.lat, ll.lng], {
          radius: 8,
          color: "#ffffff",
          weight: 2,
          fillColor: color,
          fillOpacity: 0.96,
        });
        marker.on("click", () => setSelected(job));
        marker.bindTooltip(`${jobId(job)} - ${jobAddress(job)}`, { direction: "top" });
        marker.addTo(layerRef.current);
        bounds.push([ll.lat, ll.lng]);
      });
      if (bounds.length) {
        mapRef.current.fitBounds(bounds, { padding: [34, 34], maxZoom: 13 });
      }
    }
    drawMap();
    return () => {
      cancelled = true;
    };
  }, [filteredJobs]);
  const selectedAddress = selected ? jobAddress(selected) : "";
  const selectedLatLng = selected ? jobLatLng(selected) : null;
  const googleUrl = selectedAddress
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(selectedAddress)}`
    : "#";
  return (
    <main className={`field-map-app ${mode}`}>
      <section className="field-map-topbar">
        <div>
          <span>HPD BID DASHBOARD 2026</span>
          <strong>NYC Field Command Map</strong>
        </div>
        <div className="field-map-mode-switch">
          <button className={mode === "desktop" ? "active" : ""} onClick={() => setMode("desktop")}>
            Dashboard
          </button>
          <button className={mode === "iphone" ? "active" : ""} onClick={() => setMode("iphone")}>
            iPhone
          </button>
        </div>
      </section>
      <aside className="field-map-sidebar">
        <div className="glass-card hero-card">
          <span>Live Work Orders</span>
          <strong>{mappedJobs.length}</strong>
          <small>{jobs.length} total jobs loaded · ${Math.round(totalAward / 1000)}K COA value</small>
        </div>
        <div className="glass-card search-card">
          <label>Search job, OMO, address, tenant</label>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search real HPD jobs..." />
        </div>
        <div className="borough-grid">
          {Object.entries(boroughCounts).map(([b, count]) => (
            <button key={b} onClick={() => setSearch(b)}>
              <span>{b}</span>
              <strong>{count}</strong>
            </button>
          ))}
        </div>
        <div className="job-list">
          {filteredJobs.slice(0, 18).map((job) => (
            <button
              key={jobId(job)}
              className={selected && jobId(selected) === jobId(job) ? "active" : ""}
              onClick={() => setSelected(job)}
            >
              <span>{jobId(job)} · {jobBorough(job)}</span>
              <strong>{jobAddress(job)}</strong>
              <small>{jobStatus(job)}</small>
            </button>
          ))}
        </div>
      </aside>
      <section className="field-map-stage">
        <div ref={mapNode} className="field-map-node" />
        <div className="map-floating-stats">
          <div>
            <span>Visible</span>
            <strong>{filteredJobs.length}</strong>
          </div>
          <div>
            <span>Mapped</span>
            <strong>{mappedJobs.length}</strong>
          </div>
        </div>
      </section>
      <aside className="field-job-sheet">
        {selected ? (
          <>
            <div className="sheet-handle" />
            <div className="job-sheet-head">
              <div>
                <span>{jobBorough(selected)} · {jobStatus(selected)}</span>
                <strong>{jobId(selected)}</strong>
                <p>{selectedAddress}</p>
              </div>
              <a href={googleUrl} target="_blank" rel="noopener noreferrer">Google</a>
            </div>
            <div className="job-action-grid">
              <button>Navigate</button>
              <button>Call</button>
              <button>Photos</button>
              <button>Documents</button>
            </div>
            <div className="job-detail-grid">
              <div>
                <span>COA Award</span>
                <strong>{jobAmount(selected) ? `$${jobAmount(selected).toLocaleString()}` : "—"}</strong>
              </div>
              <div>
                <span>Start Date</span>
                <strong>{value(selected, ["WorkStartDate", "StartDate"]) || "—"}</strong>
              </div>
              <div>
                <span>Complete</span>
                <strong>{value(selected, ["WorkCompletionDate", "CompletionDate"]) || "—"}</strong>
              </div>
              <div>
                <span>Coords</span>
                <strong>{selectedLatLng ? "Ready" : "Missing"}</strong>
              </div>
            </div>
            <div className="job-description">
              <span>Job Information</span>
              <p>{value(selected, ["JobDescription", "Summary", "Description"]) || "No job description captured yet."}</p>
            </div>
          </>
        ) : (
          <div className="empty-sheet">Select a job on the map.</div>
        )}
      </aside>
    </main>
  );
}

