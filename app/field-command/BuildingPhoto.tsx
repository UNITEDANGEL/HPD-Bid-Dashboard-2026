"use client";

import { useEffect, useRef, useState } from "react";
import { listFieldEvidence, saveFieldPhotos, type FieldMedia } from "../../lib/field-photo-store";
import { buildingPhoto, BUILDING_PHOTO_LABEL, streetViewLink, streetViewPicture, type StreetViewPicture } from "../../lib/building-photo";
import { listFieldPackets, type FieldPacket } from "../../lib/field-packet-store";

export default function BuildingPhoto({ id, address, borough, point }: {
  id: string; address: string; borough: string; point: { lat: number; lng: number } | null;
}) {
  const [photo, setPhoto] = useState<FieldMedia | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [packet, setPacket] = useState<FieldPacket | null>(null);
  const library = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const active = useRef(true);
  const streetView = streetViewLink(point);
  // No photo of your own yet: show Google's Street View picture of the building automatically.
  const [googlePicture, setGooglePicture] = useState<StreetViewPicture | null>(null);
  const lat = point?.lat, lng = point?.lng;
  useEffect(() => {
    let cancelled = false;
    setGooglePicture(null);
    if (lat === undefined || lng === undefined) return;
    streetViewPicture({ lat, lng }).then((picture) => { if (!cancelled) setGooglePicture(picture); }).catch(() => {});
    return () => { cancelled = true; };
  }, [lat, lng]);
  useEffect(() => {
    active.current = true;
    listFieldPackets(id).then(rows => { if (active.current) setPacket(rows.find(row => row.packetType === "full_evidence_zip") || null); })
      .catch(() => { if (active.current) setError("Could not read saved package."); });
    listFieldEvidence(id).then(rows => { if (active.current) setPhoto(buildingPhoto(rows)); })
      .catch(() => { if (active.current) setError("Could not read saved building photo."); });
    return () => { active.current = false; };
  }, [id]);

  async function save(file?: File) {
    if (!file || busy) return;
    setBusy(true); setError("");
    try {
      if (!file.type.startsWith("image/") && !/\.(jpe?g|png|webp|heic|heif)$/i.test(file.name)) throw new Error("Choose a building photo, not a video.");
      const saved = await saveFieldPhotos(id, "general", [file], { jobId: id, address, borough, label: BUILDING_PHOTO_LABEL });
      if (!saved.length) throw new Error("Photo could not be saved. Try another image.");
      if (active.current) setPhoto(buildingPhoto(saved));
    } catch (e) { if (active.current) setError(e instanceof Error ? e.message : "Photo save failed."); }
    finally {
      if (active.current) setBusy(false);
      if (library.current) library.current.value = "";
      if (camera.current) camera.current.value = "";
    }
  }

  return <section className="fc-building" aria-label="Building photo">
    {photo ? <button className="fc-building-image" type="button" aria-label={expanded ? "Collapse building photo" : "Enlarge building photo"} aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
      <img src={photo.dataUrl} alt={`Building exterior at ${address}`} onError={() => { setPhoto(null); setError("Saved photo could not be displayed. Add a readable image; the saved file is retained."); }} />
    </button> : googlePicture ? <button className="fc-building-image fc-building-google" type="button" data-hpd-smoke="building-street-view" aria-label={expanded ? "Collapse Street View picture" : "Enlarge Street View picture"} aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
      <img src={googlePicture.url} alt={`Google Street View of ${address}`} loading="lazy" onError={() => setGooglePicture(null)} />
      <small>Google</small>
    </button> : <span className="fc-building-empty">No building photo</span>}
    <div className="fc-building-actions">
      <strong>Building</strong>
      {!photo && googlePicture ? <span className="fc-building-source" data-hpd-smoke="building-street-view-note">Google Street View{googlePicture.date ? ` · ${googlePicture.date}` : ""} · take your own to replace it</span> : null}
      <div><button type="button" disabled={busy} onClick={() => camera.current?.click()}>Take photo</button><button type="button" disabled={busy} onClick={() => library.current?.click()}>Add photo</button></div>
      {streetView ? <a href={streetView} target="_blank" rel="noreferrer">View Street View ↗</a> : <span>Street View unavailable: no coordinates</span>}
      <a href="/storage/">{photo ? "Saved on device · Check Drive backup" : "Drive backup status"}</a>
    </div>
    {expanded && photo && <img className="fc-building-expanded" src={photo.dataUrl} alt={`Full building exterior at ${address}`} />}
    {expanded && !photo && googlePicture && <img className="fc-building-expanded" src={googlePicture.url} alt={`Google Street View of ${address}`} />}
    {packet && <div className="fc-building-package" role="group" aria-label="Saved complete package">
      <a href={packet.dataUrl} download={packet.fileName}>Download saved package</a>
      <span>{new Date(packet.generatedAt).toLocaleDateString()} · {packet.imageCount} photos · {packet.videoCount} videos</span>
      <small>Review before forwarding to HPD. Later edits need a new package.</small>
    </div>}
    <input hidden ref={library} type="file" accept="image/*,.heic,.heif" aria-label="Choose building photo" onChange={e => void save(e.target.files?.[0])} />
    <input hidden ref={camera} type="file" accept="image/*" capture="environment" aria-label="Take building photo" onChange={e => void save(e.target.files?.[0])} />
    {busy && <span role="status">Saving building photo...</span>}
    {error && <span role="alert">{error}</span>}
  </section>;
}
