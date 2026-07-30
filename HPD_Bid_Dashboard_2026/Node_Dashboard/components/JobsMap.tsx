"use client";

import { useEffect, useRef } from "react";
import type { JobRecord } from "../lib/types";
import { CircleMarker, MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";

type Props = {
  jobs: JobRecord[];
  selectedId: string;
  onSelect: (id: string) => void;
  focusCenter?: [number, number] | null;
  focusZoom?: number;
  focusKey?: string;
  userLocation?: [number, number] | null;
  variant?: "pins" | "clusters";
};

function coordsFor(job: JobRecord): [number, number] | null {
  const latitude = Number(job.latitude);
  const longitude = Number(job.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return [latitude, longitude];
}

function statusColor(status: string, archived: boolean, borough: string) {
  if (archived) return "#475569";
  const normalized = status.toLowerCase();
  if (normalized.includes("access") || normalized.includes("refused")) return "#a8b7cb";
  if (normalized.includes("completed")) return "#2dd47d";

  const boro = borough.toLowerCase();
  if (boro.includes("manhattan")) return "#2f9cff";
  if (boro.includes("brooklyn")) return "#2dd47d";
  if (boro.includes("queens")) return "#8a5cff";
  if (boro.includes("bronx")) return "#ff9a3d";
  if (boro.includes("staten")) return "#ff5f78";

  if (normalized.includes("awarded")) return "#2f9cff";
  if (normalized.includes("progress")) return "#8a5cff";
  return "#2dd47d";
}

function markerIcon(color: string, selected: boolean) {
  return L.divIcon({
    className: "job-pin-icon",
    html: `<span class="job-pin ${selected ? "is-selected" : ""}" style="--pin-color: ${color}"><span></span></span>`,
    iconSize: selected ? [42, 42] : [30, 38],
    iconAnchor: selected ? [21, 21] : [15, 36],
    popupAnchor: [0, -30],
  });
}

type JobCluster = {
  id: string;
  jobs: JobRecord[];
  center: [number, number];
  color: string;
  selected: boolean;
};

function clusterIcon(color: string, count: number, selected: boolean) {
  return L.divIcon({
    className: "job-cluster-icon",
    html: `<span class="job-cluster ${selected ? "is-selected" : ""}" style="--pin-color: ${color}">${count}</span>`,
    iconSize: selected ? [58, 58] : [38, 38],
    iconAnchor: selected ? [29, 29] : [19, 19],
    popupAnchor: [0, -22],
  });
}

function clusteredJobs(jobs: JobRecord[], selectedId: string) {
  const gridSize = 0.023;
  const groups = new Map<string, JobRecord[]>();

  for (const job of jobs) {
    const coords = coordsFor(job);
    if (!coords) continue;
    const key = `${Math.round(coords[0] / gridSize)}:${Math.round(coords[1] / gridSize)}`;
    groups.set(key, [...(groups.get(key) || []), job]);
  }

  return Array.from(groups.entries()).map(([key, records]) => {
    const coords = records
      .map(coordsFor)
      .filter((point): point is [number, number] => Boolean(point));
    const center: [number, number] = [
      coords.reduce((sum, point) => sum + point[0], 0) / Math.max(1, coords.length),
      coords.reduce((sum, point) => sum + point[1], 0) / Math.max(1, coords.length),
    ];
    const selected = records.some((job) => job.id === selectedId);
    const leadJob = records.find((job) => job.id === selectedId) || records[0];

    return {
      id: key,
      jobs: records,
      center,
      color: statusColor(leadJob.status, leadJob.archived, leadJob.borough),
      selected,
    } satisfies JobCluster;
  });
}

function MapViewport({
  jobs,
  selectedId,
  focusCenter,
  focusZoom,
  focusKey = "",
}: {
  jobs: JobRecord[];
  selectedId: string;
  focusCenter?: [number, number] | null;
  focusZoom?: number;
  focusKey?: string;
}) {
  const map = useMap();
  const lastFocusKey = useRef("");

  useEffect(() => {
    const resizeTimer = window.setTimeout(() => map.invalidateSize(), 150);
    const size = map.getSize();
    if (!Number.isFinite(size.x) || !Number.isFinite(size.y) || size.x < 10 || size.y < 10) {
      return () => window.clearTimeout(resizeTimer);
    }

    const points = jobs
      .map(coordsFor)
      .filter((coords): coords is [number, number] => Boolean(coords));

    const focusChanged = lastFocusKey.current !== focusKey;
    if (focusChanged) {
      lastFocusKey.current = focusKey;
      if (focusCenter && focusZoom) {
        map.setView(focusCenter, focusZoom, { animate: false });
        return () => window.clearTimeout(resizeTimer);
      }

      if (points.length === 1) {
        map.setView(points[0], 14, { animate: false });
        return () => window.clearTimeout(resizeTimer);
      }

      if (points.length > 1) {
        map.fitBounds(points, { padding: [42, 42], maxZoom: 13, animate: false });
        return () => window.clearTimeout(resizeTimer);
      }

      if (focusCenter) {
        map.setView(focusCenter, 12, { animate: false });
        return () => window.clearTimeout(resizeTimer);
      }
    }

    const selected = jobs.find((job) => job.id === selectedId && coordsFor(job));
    const selectedCoords = selected ? coordsFor(selected) : null;
    if (selectedCoords) {
      map.setView(selectedCoords, 15, { animate: false });
      return () => window.clearTimeout(resizeTimer);
    }

    if (points.length === 1) {
      map.setView(points[0], 14, { animate: false });
      return () => window.clearTimeout(resizeTimer);
    }

    if (points.length > 1) {
      map.fitBounds(points, { padding: [30, 30], animate: false });
    }
    return () => window.clearTimeout(resizeTimer);
  }, [focusCenter, focusKey, focusZoom, jobs, map, selectedId]);

  return null;
}

export function JobsMap({ jobs, selectedId, onSelect, focusCenter, focusZoom, focusKey, userLocation, variant = "pins" }: Props) {
  const clusters = variant === "clusters" ? clusteredJobs(jobs, selectedId) : [];

  return (
    <MapContainer
      center={[40.7128, -74.006]}
      zoom={11}
      scrollWheelZoom
      className="jobs-map"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
      />
      <MapViewport jobs={jobs} selectedId={selectedId} focusCenter={focusCenter} focusZoom={focusZoom} focusKey={focusKey} />

      {userLocation ? (
        <CircleMarker
          center={userLocation}
          radius={9}
          pathOptions={{ color: "#ffffff", fillColor: "#2f9cff", fillOpacity: 0.95, weight: 3 }}
        >
          <Popup>You are here</Popup>
        </CircleMarker>
      ) : null}

      {variant === "clusters" ? (
        clusters.map((cluster) => {
          const leadJob = cluster.jobs.find((job) => job.id === selectedId) || cluster.jobs[0];
          return (
            <Marker
              key={cluster.id}
              position={cluster.center}
              icon={clusterIcon(cluster.color, cluster.jobs.length, cluster.selected)}
              eventHandlers={{
                click: () => onSelect(leadJob.id),
              }}
            >
              <Popup>
                <div className="map-popup">
                  <strong>{cluster.jobs.length} mapped jobs</strong>
                  <span>{leadJob.borough || "Unknown borough"}</span>
                  <span>{leadJob.address || "No address listed"}</span>
                  <button type="button" className="map-popup-button" onClick={() => onSelect(leadJob.id)}>
                    Open details
                  </button>
                </div>
              </Popup>
            </Marker>
          );
        })
      ) : jobs
        .map((job) => {
          const coords = coordsFor(job);
          if (!coords) return null;
          const selected = job.id === selectedId;
          const color = statusColor(job.status, job.archived, job.borough);

          return (
            <Marker
              key={`${job.id}-${job.latitude}-${job.longitude}`}
              position={coords}
              icon={markerIcon(color, selected)}
              eventHandlers={{
                click: () => onSelect(job.id),
              }}
            >
              <Popup>
                <div className="map-popup">
                  <strong>{job.id}</strong>
                  <span>{job.address || "No address listed"}</span>
                  <span>{job.borough || "Unknown borough"} | {job.trade || "Trade not listed"}</span>
                  <span>{job.awardDate || "Award date not listed"}</span>
                  <span>{job.bidAmount || "Not listed"}</span>
                  <button type="button" className="map-popup-button" onClick={() => onSelect(job.id)}>
                    Open details
                  </button>
                </div>
              </Popup>
            </Marker>
          );
        })}
    </MapContainer>
  );
}
