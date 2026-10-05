"use client";

import { useEffect, useRef, useState } from "react";
import { listFieldEvidence, saveFieldPhotos, type FieldMedia } from "../../lib/field-photo-store";
import { buildingPhoto, BUILDING_PHOTO_LABEL, streetViewLink, streetViewPicture, type StreetViewPicture } from "../../lib/building-photo";
import { listFieldPackets, type FieldPacket } from "../../lib/field-packet-store";

// Banner at the top of the job card: your own building photo if you took one, otherwise Google's
// Street View picture of the building. On it: the 360° Street View (Google Maps), and a button to
// take your own building photo (it replaces Google's).
export function BuildingHero({ id, address, borough, point }: { id: string; address: string; borough: string; point: { lat: number; lng: number } | null }) {
  const [own, setOwn] = useState<FieldMedia | null>(null);
  const [google, setGoogle] = useState<StreetViewPicture | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const camera = useRef<HTMLInputElement>(null);
  const lat = point?.lat, lng = point?.lng;
  useEffect(() => {
    let cancelled = false;
    setOwn(null); setGoogle(null); setError("");
    listFieldEvidence(id).then((rows) => { if (!cancelled) setOwn(buildingPhoto(rows)); }).catch(() => {});
    if (lat !== undefined && lng !== undefined) streetViewPicture({ lat, lng }).then((picture) => { if (!cancelled) setGoogle(picture); }).catch(() => {});
    return () => { cancelled = true; };
  }, [id, lat, lng]);
  async function save(file?: File) {
    if (!file || busy) return;
    setBusy(true); setError("");
    try {
      if (!file.type.startsWith("image/") && !/\.(jpe?g|png|webp|heic|heif)$/i.test(file.name)) throw new Error("Choose a building photo, not a video.");
      const saved = await saveFieldPhotos(id, "general", [file], { jobId: id, address, borough, label: BUILDING_PHOTO_LABEL });
      if (!saved.length) throw new Error("Photo could not be saved. Try another image.");
      setOwn(buildingPhoto(saved));
    } catch (e) { setError(e instanceof Error ? e.message : "Photo save failed."); }
    finally { setBusy(false); if (camera.current) camera.current.value = ""; }
  }
  const src = own?.dataUrl || google?.url || "";
  const link360 = point ? streetViewLink(point, google?.pano || "", google?.heading) : null;
  if (!src && !link360) return null;
  return <figure className={`jc-hero-photo ${src ? "" : "is-empty"}`} data-hpd-smoke="jc-hero-photo">
    {src ? <img src={src} alt={`Building at ${address}`} onError={() => { if (own) setOwn(null); else setGoogle(null); }} /> : <span className="jc-hero-empty">No building picture yet</span>}
    {src ? <figcaption>{own ? "Your photo" : `Google Street View${google?.date ? ` · ${google.date}` : ""}`}</figcaption> : null}
    <div className="jc-hero-actions">
      {link360 ? <a className="jc-hero-360" data-hpd-smoke="jc-hero-360" href={link360} target="_blank" rel="noreferrer">🔄 360° view</a> : null}
      <button type="button" data-hpd-smoke="jc-hero-photo-take" disabled={busy} onClick={() => camera.current?.click()} aria-label="Take your own building photo">📷{own ? "" : " Your photo"}</button>
    </div>
    <input hidden ref={camera} type="file" accept="image/*" capture="environment" aria-label="Take building photo" onChange={(e) => void save(e.target.files?.[0])} />
    {busy ? <span className="jc-hero-note" role="status">Saving building photo…</span> : null}
    {error ? <span className="jc-hero-note" role="alert">{error}</span> : null}
  </figure>;
}

// A complete package saved on this phone (made without Google connected): download it again.
export function SavedPackageLink({ id }: { id: string }) {
  const [packet, setPacket] = useState<FieldPacket | null>(null);
  useEffect(() => {
    let cancelled = false;
    listFieldPackets(id).then((rows) => { if (!cancelled) setPacket(rows.find((row) => row.packetType === "full_evidence_zip") || null); }).catch(() => {});
    return () => { cancelled = true; };
  }, [id]);
  if (!packet) return null;
  return <div className="fc-building-package" role="group" aria-label="Saved complete package">
    <a href={packet.dataUrl} download={packet.fileName}>Download saved package</a>
    <span>{new Date(packet.generatedAt).toLocaleDateString()} · {packet.imageCount} photos · {packet.videoCount} videos</span>
  </div>;
}
