import type { FieldMedia } from "./field-photo-store";

export const BUILDING_PHOTO_LABEL = "Building exterior";

export function buildingPhoto(rows: FieldMedia[]) {
  return rows.filter(row => row.kind === "general" && row.mediaType === "image" && row.evidenceLabel === BUILDING_PHOTO_LABEL)
    .sort((a, b) => b.capturedAt.localeCompare(a.capturedAt))[0] || null;
}

export function streetViewLink(point: { lat: number; lng: number } | null) {
  if (!point || !Number.isFinite(point.lat) || !Number.isFinite(point.lng) || Math.abs(point.lat) > 90 || Math.abs(point.lng) > 180 || (point.lat === 0 && point.lng === 0)) return null;
  const params = new URLSearchParams({ api: "1", map_action: "pano", viewpoint: `${point.lat},${point.lng}` });
  return `https://www.google.com/maps/@?${params}`;
}
