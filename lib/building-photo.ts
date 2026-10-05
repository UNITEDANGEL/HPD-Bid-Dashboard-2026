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

// Automatic building picture from Google Street View (needs NEXT_PUBLIC_GOOGLE_MAPS_KEY, a Google
// Maps key with the Street View Static API enabled, restricted to the app's website).
export const GOOGLE_MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY || "";

type Point = { lat: number; lng: number };

// Compass direction from the camera to the building, so the picture faces the building.
export function headingTo(from: Point, to: Point) {
  const rad = Math.PI / 180;
  const y = Math.sin((to.lng - from.lng) * rad) * Math.cos(to.lat * rad);
  const x = Math.cos(from.lat * rad) * Math.sin(to.lat * rad) - Math.sin(from.lat * rad) * Math.cos(to.lat * rad) * Math.cos((to.lng - from.lng) * rad);
  return Math.round(((Math.atan2(y, x) / rad) + 360) % 360);
}

export type StreetViewPicture = { url: string; date: string };

// Asks Google for the nearest outdoor panorama (the metadata call is free), then builds the
// picture address aimed at the building. Null when there is no key or no Street View there.
// One lookup per building while the app is open (the banner and Documents both ask).
const pictureCache = new Map<string, Promise<StreetViewPicture | null>>();

export function streetViewPicture(point: Point | null, key = GOOGLE_MAPS_KEY): Promise<StreetViewPicture | null> {
  if (!key || !point || !streetViewLink(point)) return Promise.resolve(null);
  const cacheKey = `${point.lat},${point.lng}`;
  if (!pictureCache.has(cacheKey)) pictureCache.set(cacheKey, lookupStreetView(point, key));
  return pictureCache.get(cacheKey)!;
}

async function lookupStreetView(point: Point, key: string): Promise<StreetViewPicture | null> {
  const location = `${point.lat},${point.lng}`;
  const metaUrl = `https://maps.googleapis.com/maps/api/streetview/metadata?${new URLSearchParams({ location, source: "outdoor", radius: "60", key })}`;
  const meta = await fetch(metaUrl).then((response) => (response.ok ? response.json() : null)).catch(() => null) as
    { status?: string; pano_id?: string; date?: string; location?: Point } | null;
  if (!meta || meta.status !== "OK" || !meta.pano_id) return null;
  const heading = meta.location ? headingTo(meta.location, point) : 0;
  const url = `https://maps.googleapis.com/maps/api/streetview?${new URLSearchParams({ size: "640x400", pano: meta.pano_id, heading: String(heading), fov: "75", pitch: "8", key })}`;
  return { url, date: meta.date || "" };
}
