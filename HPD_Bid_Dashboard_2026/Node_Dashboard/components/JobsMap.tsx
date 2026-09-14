"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { JobRecord } from "../lib/types";
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";

type Props = {
  jobs: JobRecord[];
  selectedId: string;
  onSelect: (id: string) => void;
  focusCenter?: [number, number] | null;
  focusZoom?: number;
  focusKey?: string;
  userLocation?: [number, number] | null;
  routeJobs?: JobRecord[];
  activeRouteStopId?: string;
  newAwardIds?: string[];
  latestAwardIds?: string[];
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
  if (normalized.includes("progress") || normalized.includes("arrived") || normalized.includes("started")) return "#8a5cff";
  return "#2dd47d";
}

function statusTone(job: JobRecord) {
  if (job.archived) return "archived";
  const normalized = String(job.status || "").toLowerCase();
  if (normalized.includes("completed")) return "complete";
  if (normalized.includes("access") || normalized.includes("refused")) return "blocked";
  if (
    normalized.includes("arrived") ||
    normalized.includes("started") ||
    normalized.includes("progress") ||
    normalized.includes("materials") ||
    normalized.includes("follow")
  ) {
    return "active";
  }
  if (normalized.includes("award") || normalized.includes("match") || normalized.includes("recovered")) return "awarded";
  return "open";
}

function pinLabelForTone(tone: string) {
  if (tone === "complete") return "OK";
  if (tone === "blocked") return "!";
  if (tone === "active") return "GO";
  if (tone === "awarded") return "$";
  if (tone === "archived") return "-";
  return "+";
}

function markerIcon({
  color,
  selected,
  tone,
  freshLabel,
  dateLabel,
}: {
  color: string;
  selected: boolean;
  tone: string;
  freshLabel?: string;
  dateLabel?: string;
}) {
  return L.divIcon({
    className: "job-pin-icon",
    html: [
      `<span class="job-pin tone-${tone} ${selected ? "is-selected" : ""} ${freshLabel ? "is-fresh" : ""}" style="--pin-color: ${color}">`,
      `<span class="job-pin-core">${escapeHtml(pinLabelForTone(tone))}</span>`,
      dateLabel ? `<span class="job-pin-date">${escapeHtml(dateLabel)}</span>` : "",
      freshLabel ? `<span class="job-pin-new">${escapeHtml(freshLabel)}</span>` : "",
      "</span>",
    ].join(""),
    iconSize: selected ? [82, 46] : [68, 42],
    iconAnchor: selected ? [41, 34] : [34, 36],
    popupAnchor: [0, -30],
  });
}

function escapeHtml(value: string) {
  return String(value || "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[character] || character));
}

function formatMapShortDate(value: string) {
  const raw = String(value || "").trim();
  const isoDateOnly = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  const slashDateOnly = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  const date = isoDateOnly
    ? new Date(Number(isoDateOnly[1]), Number(isoDateOnly[2]) - 1, Number(isoDateOnly[3]))
    : slashDateOnly
      ? new Date(
        Number(slashDateOnly[3]) < 100 ? 2000 + Number(slashDateOnly[3]) : Number(slashDateOnly[3]),
        Number(slashDateOnly[1]) - 1,
        Number(slashDateOnly[2]),
      )
      : new Date(raw);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(date);
}

function maturityDateValue(job: JobRecord) {
  return job.completionDate || job.startDate || job.awardDate;
}

function mapMaturityLabel(job: JobRecord) {
  const label = job.completionDate ? "Due" : job.startDate ? "Start" : "Award";
  const date = formatMapShortDate(maturityDateValue(job));
  return date ? `${label} ${date}` : "No date";
}

function mapMaturityShortLabel(job: JobRecord) {
  return formatMapShortDate(maturityDateValue(job)) || "Date";
}

type JobCluster = {
  id: string;
  jobs: JobRecord[];
  center: [number, number];
  color: string;
  selected: boolean;
  freshLabel: string;
  statusMix: string[];
};

const BOROUGH_LABELS: Array<{ label: string; position: [number, number] }> = [
  { label: "The Bronx", position: [40.8448, -73.8648] },
  { label: "Manhattan", position: [40.7831, -73.9712] },
  { label: "Queens", position: [40.7282, -73.7949] },
  { label: "Brooklyn", position: [40.6782, -73.9442] },
  { label: "Staten Island", position: [40.5795, -74.1502] },
];

function boroughLabelIcon(label: string) {
  return L.divIcon({
    className: "map-borough-label-icon",
    html: `<span class="map-borough-label">${escapeHtml(label)}</span>`,
    iconSize: [126, 24],
    iconAnchor: [63, 12],
  });
}

function clusterIcon(cluster: JobCluster, leadJob: JobRecord, showDate: boolean) {
  const maturityLabel = mapMaturityLabel(leadJob);
  const coreLabel = showDate ? mapMaturityShortLabel(leadJob) : String(cluster.jobs.length);
  const count = showDate && cluster.jobs.length > 1 ? `<small class="job-cluster-count">${cluster.jobs.length}</small>` : "";
  const label = cluster.selected
    ? `<span class="job-cluster-label">${escapeHtml(leadJob.id)}<small>${escapeHtml(maturityLabel)}</small></span>`
    : "";
  const mix = cluster.statusMix.map((tone) => `<i class="cluster-mix-dot tone-${escapeHtml(tone)}"></i>`).join("");
  const fresh = cluster.freshLabel ? `<span class="job-cluster-new">${escapeHtml(cluster.freshLabel)}</span>` : "";

  return L.divIcon({
    className: "job-cluster-icon",
    html: `<span class="job-cluster-wrap"><span class="job-cluster ${cluster.selected ? "is-selected" : ""} ${showDate ? "shows-date" : ""}" style="--pin-color: ${cluster.color}"><strong>${escapeHtml(coreLabel)}</strong>${count}<span class="job-cluster-mix">${mix}</span>${fresh}</span>${label}</span>`,
    iconSize: cluster.selected ? [168, 58] : showDate ? [68, 46] : [44, 44],
    iconAnchor: cluster.selected ? [30, 32] : showDate ? [34, 42] : [22, 22],
    popupAnchor: [0, -22],
  });
}

function routeStopIcon(index: number, active: boolean, job: JobRecord, freshLabel: string) {
  const color = statusColor(job.status, job.archived, job.borough);
  const tone = statusTone(job);
  const fresh = freshLabel ? `<span class="route-stop-new">${escapeHtml(freshLabel)}</span>` : "";

  return L.divIcon({
    className: "route-stop-marker-icon",
    html: `<span class="route-stop-marker tone-${tone} ${active ? "is-active" : ""}" style="--pin-color: ${color}"><strong>${index}</strong>${fresh}</span>`,
    iconSize: active ? [52, 52] : [40, 40],
    iconAnchor: active ? [26, 26] : [20, 20],
    popupAnchor: [0, -22],
  });
}

function userLocationIcon() {
  return L.divIcon({
    className: "user-location-marker-icon",
    html: '<span class="user-location-marker"><span></span></span>',
    iconSize: [46, 46],
    iconAnchor: [23, 23],
    popupAnchor: [0, -18],
  });
}

function gridSizeForZoom(zoom: number) {
  if (zoom >= 16) return 0.0018;
  if (zoom >= 15) return 0.0032;
  if (zoom >= 14) return 0.006;
  if (zoom >= 13) return 0.011;
  if (zoom >= 12) return 0.018;
  return 0.032;
}

function clusteredJobs(jobs: JobRecord[], selectedId: string, freshIds: Set<string>, latestIds: Set<string>, zoom: number) {
  const gridSize = gridSizeForZoom(zoom);
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
    const tones = Array.from(new Set(records.map(statusTone)));

    return {
      id: key,
      jobs: records,
      center,
      color: statusColor(leadJob.status, leadJob.archived, leadJob.borough),
      selected,
      freshLabel: records.some((job) => freshIds.has(job.id)) ? "NEW" : records.some((job) => latestIds.has(job.id)) ? "LATEST" : "",
      statusMix: tones.slice(0, 3),
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

function MapZoomWatcher({ onZoom }: { onZoom: (zoom: number) => void }) {
  const map = useMap();

  useEffect(() => {
    const syncZoom = () => onZoom(map.getZoom());
    syncZoom();
    map.on("zoomend", syncZoom);
    return () => {
      map.off("zoomend", syncZoom);
    };
  }, [map, onZoom]);

  return null;
}

function ClusterMarker({
  cluster,
  leadJob,
  mapZoom,
  onSelect,
}: {
  cluster: JobCluster;
  leadJob: JobRecord;
  mapZoom: number;
  onSelect: (id: string) => void;
}) {
  const map = useMap();
  const showDate = cluster.selected || (cluster.jobs.length === 1 && mapZoom >= 15);

  return (
    <Marker
      key={cluster.id}
      position={cluster.center}
      icon={clusterIcon(cluster, leadJob, showDate)}
      eventHandlers={{
        click: () => {
          if (cluster.jobs.length > 1 && mapZoom < 15) {
            map.setView(cluster.center, Math.min(15, mapZoom + 2), { animate: true });
          }
          onSelect(leadJob.id);
        },
      }}
    >
      <Popup>
        <div className="map-popup">
          <strong>{cluster.jobs.length === 1 ? leadJob.id : `${cluster.jobs.length} mapped jobs`}</strong>
          <span>OMO {leadJob.id} | {mapMaturityLabel(leadJob)}</span>
          <span>{leadJob.address || "No address listed"}</span>
          <span>{leadJob.borough || "Unknown borough"} | {leadJob.bidAmount || "Amount not listed"}</span>
          <button type="button" className="map-popup-button" onClick={() => onSelect(leadJob.id)}>
            Open details
          </button>
        </div>
      </Popup>
    </Marker>
  );
}

export function JobsMap({
  jobs,
  selectedId,
  onSelect,
  focusCenter,
  focusZoom,
  focusKey,
  userLocation,
  routeJobs = [],
  activeRouteStopId = "",
  newAwardIds = [],
  latestAwardIds = [],
  variant = "pins",
}: Props) {
  const [mapZoom, setMapZoom] = useState(11);
  const freshIdSet = useMemo(() => new Set(newAwardIds), [newAwardIds]);
  const latestIdSet = useMemo(() => new Set(latestAwardIds), [latestAwardIds]);
  const clusters = useMemo(
    () => variant === "clusters" ? clusteredJobs(jobs, selectedId, freshIdSet, latestIdSet, mapZoom) : [],
    [freshIdSet, jobs, latestIdSet, mapZoom, selectedId, variant],
  );
  const routePositions = [
    ...(userLocation ? [userLocation] : []),
    ...routeJobs.map(coordsFor).filter((coords): coords is [number, number] => Boolean(coords)),
  ];

  return (
    <MapContainer
      center={[40.7128, -74.006]}
      zoom={11}
      scrollWheelZoom
      className="jobs-map"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        className="map-tile-layer"
      />
      <MapViewport jobs={jobs} selectedId={selectedId} focusCenter={focusCenter} focusZoom={focusZoom} focusKey={focusKey} />
      <MapZoomWatcher onZoom={setMapZoom} />

      {routePositions.length > 1 ? (
        <>
          <Polyline className="map-route-line-glow" positions={routePositions} pathOptions={{ color: "#2dd47d", opacity: 0.24, weight: 12 }} />
          <Polyline className="map-route-line" positions={routePositions} pathOptions={{ color: "#2f9cff", opacity: 0.88, weight: 5, dashArray: "10 8" }} />
        </>
      ) : null}

      {variant === "clusters" ? BOROUGH_LABELS.map((borough) => (
        <Marker
          key={`borough-label-${borough.label}`}
          position={borough.position}
          icon={boroughLabelIcon(borough.label)}
          interactive={false}
          keyboard={false}
          zIndexOffset={-250}
        />
      )) : null}

      {userLocation ? (
        <Marker
          position={userLocation}
          icon={userLocationIcon()}
          interactive={false}
          keyboard={false}
          zIndexOffset={700}
        >
          <Popup>You are here</Popup>
        </Marker>
      ) : null}

      {routeJobs.map((job, index) => {
        const coords = coordsFor(job);
        if (!coords) return null;
        const freshLabel = freshIdSet.has(job.id) ? "NEW" : latestIdSet.has(job.id) ? "LATEST" : "";
        return (
          <Marker
            key={`${job.id}-route-stop-${index}`}
            position={coords}
            icon={routeStopIcon(index + 1, job.id === activeRouteStopId, job, freshLabel)}
            zIndexOffset={job.id === activeRouteStopId ? 1000 : 850}
            eventHandlers={{
              click: () => onSelect(job.id),
            }}
          >
            <Popup>
              <div className="map-popup">
                <strong>Stop {index + 1}: {job.id}</strong>
                <span>{job.address || "No address listed"}</span>
                <span>{job.borough || "Unknown borough"} | {job.trade || "Trade not listed"}</span>
                <span>{mapMaturityLabel(job)}</span>
                <button type="button" className="map-popup-button" onClick={() => onSelect(job.id)}>
                  Open stop
                </button>
              </div>
            </Popup>
          </Marker>
        );
      })}

      {variant === "clusters" ? (
        clusters.map((cluster) => {
          const leadJob = cluster.jobs.find((job) => job.id === selectedId) || cluster.jobs[0];
          return (
            <ClusterMarker
              key={cluster.id}
              cluster={cluster}
              leadJob={leadJob}
              mapZoom={mapZoom}
              onSelect={onSelect}
            />
          );
        })
      ) : jobs
        .map((job) => {
          const coords = coordsFor(job);
          if (!coords) return null;
          const selected = job.id === selectedId;
          const color = statusColor(job.status, job.archived, job.borough);
          const freshLabel = freshIdSet.has(job.id) ? "NEW" : latestIdSet.has(job.id) ? "LATEST" : "";
          const dateLabel = mapMaturityShortLabel(job);

          return (
            <Marker
              key={`${job.id}-${job.latitude}-${job.longitude}`}
              position={coords}
              icon={markerIcon({ color, selected, tone: statusTone(job), freshLabel, dateLabel })}
              eventHandlers={{
                click: () => onSelect(job.id),
              }}
            >
              <Popup>
                <div className="map-popup">
                  <strong>{job.id}</strong>
                  <span>{job.address || "No address listed"}</span>
                  <span>{job.borough || "Unknown borough"} | {job.trade || "Trade not listed"}</span>
                  <span>{mapMaturityLabel(job)}</span>
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
