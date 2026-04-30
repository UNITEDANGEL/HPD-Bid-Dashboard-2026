"use client";

import { useEffect } from "react";
import type { JobRecord } from "../lib/types";
import { CircleMarker, MapContainer, Popup, TileLayer, useMap } from "react-leaflet";

type Props = {
  jobs: JobRecord[];
  selectedId: string;
  onSelect: (id: string) => void;
};

function statusColor(status: string) {
  const normalized = status.toLowerCase();
  if (normalized.includes("completed")) return "#16a34a";
  if (normalized.includes("awarded")) return "#f97316";
  if (normalized.includes("progress")) return "#2563eb";
  if (normalized.includes("access") || normalized.includes("refused")) return "#d97706";
  return "#64748b";
}

function markerRadius(amountValue: number, selected: boolean) {
  const size = amountValue >= 5000 ? 12 : amountValue >= 2500 ? 10 : amountValue >= 1000 ? 8 : 7;
  return selected ? size + 3 : size;
}

function MapViewport({ jobs, selectedId }: { jobs: JobRecord[]; selectedId: string }) {
  const map = useMap();

  useEffect(() => {
    const selected = jobs.find((job) => job.id === selectedId && job.latitude && job.longitude);
    if (selected) {
      map.flyTo([Number(selected.latitude), Number(selected.longitude)], 15, {
        duration: 0.8,
      });
      return;
    }

    const points = jobs
      .filter((job) => job.latitude && job.longitude)
      .map((job) => [Number(job.latitude), Number(job.longitude)] as [number, number]);

    if (points.length === 1) {
      map.setView(points[0], 14);
      return;
    }

    if (points.length > 1) {
      map.fitBounds(points, { padding: [30, 30] });
    }
  }, [jobs, map, selectedId]);

  return null;
}

export function JobsMap({ jobs, selectedId, onSelect }: Props) {
  return (
    <MapContainer
      center={[40.7128, -74.006]}
      zoom={11}
      scrollWheelZoom
      className="jobs-map"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <MapViewport jobs={jobs} selectedId={selectedId} />

      {jobs
        .filter((job) => job.latitude && job.longitude)
        .map((job) => {
          const selected = job.id === selectedId;
          const color = statusColor(job.status);

          return (
            <CircleMarker
              key={`${job.id}-${job.latitude}-${job.longitude}`}
              center={[Number(job.latitude), Number(job.longitude)]}
              pathOptions={{
                color,
                fillColor: color,
                fillOpacity: 0.85,
                weight: selected ? 4 : 2,
              }}
              radius={markerRadius(job.amountValue, selected)}
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
            </CircleMarker>
          );
        })}
    </MapContainer>
  );
}
