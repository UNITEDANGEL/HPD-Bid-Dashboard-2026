"use client";

import { useEffect, useRef, useState } from "react";

type JobRecord = {
  id?: string;
  address?: string;
  borough?: string;
  status?: string;
  trade?: string;
  latitude?: number | string;
  longitude?: number | string;
  lat?: number | string;
  lon?: number | string;
  lng?: number | string;
};

function toNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export default function MapClient() {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const leafletMapRef = useRef<any>(null);
  const [status, setStatus] = useState("Loading map data...");

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        const L = await import("leaflet");

        if (!mapRef.current || leafletMapRef.current || cancelled) return;

        const map = L.map(mapRef.current).setView([40.7128, -74.006], 10);
        leafletMapRef.current = map;

        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution: '&copy; OpenStreetMap contributors',
        }).addTo(map);

        const res = await fetch("/api/jobs", { cache: "no-store" });
        const jobs: JobRecord[] = await res.json();

        let plotted = 0;
        const bounds: any[] = [];

        jobs.forEach((job) => {
          const lat = toNumber(job.latitude ?? job.lat);
          const lng = toNumber(job.longitude ?? job.lng ?? job.lon);

          if (lat === null || lng === null) return;

          const marker = L.marker([lat, lng]).addTo(map);

          marker.bindPopup(`
            <strong>${job.id || "HPD Job"}</strong><br/>
            ${job.address || "No address listed"}<br/>
            ${job.borough || ""}<br/>
            ${job.trade || ""}<br/>
            ${job.status || ""}
          `);

          bounds.push([lat, lng]);
          plotted += 1;
        });

        if (bounds.length) {
          map.fitBounds(bounds, { padding: [30, 30] });
        }

        setStatus(`${plotted} mapped jobs`);
      } catch (err) {
        console.error(err);
        setStatus("Map failed to load. Check /api/jobs and coordinate fields.");
      }
    }

    run();

    return () => {
      cancelled = true;
      if (leafletMapRef.current) {
        leafletMapRef.current.remove();
        leafletMapRef.current = null;
      }
    };
  }, []);

  return (
    <div style={{ padding: "24px" }}>
      <div style={{ marginBottom: "16px" }}>
        <p className="eyebrow">Free Map</p>
        <h1>HPD Job Map</h1>
        <p>{status}</p>
      </div>

      <div
        ref={mapRef}
        style={{
          width: "100%",
          height: "72vh",
          borderRadius: "18px",
          overflow: "hidden",
          border: "1px solid rgba(255,255,255,0.15)",
        }}
      />
    </div>
  );
}
