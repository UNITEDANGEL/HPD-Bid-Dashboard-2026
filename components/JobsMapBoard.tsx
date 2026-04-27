"use client";
import React, { useState, useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
export function JobsMapBoard({ jobs }) {
  const [selectedJob, setSelectedJob] = useState(jobs?.[0]);
  const [mapLoaded, setMapLoaded] = useState(false);
  const mapContainer = useRef(null);
  const map = useRef(null);
  const markersRef = useRef([]);
  useEffect(() => {
    // CRITICAL SAFETY CHECK: Prevent crash if token or container is missing
    if (!MAPBOX_TOKEN || map.current || !mapContainer.current || !jobs?.length) return;
    try {
      mapboxgl.accessToken = MAPBOX_TOKEN;
      map.current = new mapboxgl.Map({
        container: mapContainer.current,
        style: 'mapbox://styles/mapbox/dark-v11',
        center: [Number(jobs[0].lng) || -73.935242, Number(jobs[0].lat) || 40.730610],
        zoom: 11,
        pitch: 0
      });
      map.current.on('load', () => {
        setMapLoaded(true);
        // Force a resize check to prevent blank gray tiles
        map.current.resize();
      });
      // Clear existing markers to prevent duplicates
      markersRef.current.forEach(m => m.marker.remove());
      markersRef.current = [];
      jobs.forEach((job) => {
        const lng = Number(job.lng);
        const lat = Number(job.lat);
        if (isNaN(lng) || isNaN(lat)) return;
        const el = document.createElement('div');
        el.style.cursor = 'pointer';
        el.innerHTML = `<div style="background-color: #1e293b; color: white; padding: 2px 6px; border-radius: 4px; font-family: monospace; font-size: 10px; border: 1px solid #475569; white-space: nowrap;">${job.id}</div>`;
        el.onclick = (e) => {
          e.stopPropagation();
          setSelectedJob(job);
        };
        const marker = new mapboxgl.Marker(el)
          .setLngLat([lng, lat])
          .addTo(map.current);
        markersRef.current.push({ id: job.id, el: el.firstChild, marker });
      });
    } catch (e) {
      console.error("Mapbox Init Error:", e);
    }
    return () => {
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, [jobs]);
  useEffect(() => {
    if (!map.current || !selectedJob) return;
    const lng = Number(selectedJob.lng);
    const lat = Number(selectedJob.lat);
    if (!isNaN(lng) && !isNaN(lat)) {
      map.current.flyTo({ center: [lng, lat], zoom: 14, essential: true });
    }
    markersRef.current.forEach(({ id, el }) => {
      if (el) {
        el.style.backgroundColor = id === selectedJob.id ? '#2563eb' : '#1e293b';
        el.style.borderColor = id === selectedJob.id ? '#60a5fa' : '#475569';
        el.style.zIndex = id === selectedJob.id ? '100' : '1';
      }
    });
  }, [selectedJob]);
  if (!MAPBOX_TOKEN) return <div className="p-10 text-red-500 font-bold bg-black h-screen">CRITICAL ERROR: Mapbox Token not found in Render Environment Variables.</div>;
  if (!jobs?.length) return <div className="p-10 text-white bg-black h-screen font-mono">Scanning G: Drive... No Jobs Found.</div>;
  return (
    <div className="fixed inset-0 h-screen w-full flex flex-col bg-black overflow-hidden select-none">
      <div className="h-28 w-full bg-slate-900 border-b border-slate-800 p-3 overflow-y-auto flex-shrink-0 z-30">
        <div className="flex flex-wrap gap-2">
          {jobs.map((job) => (
            <button key={job.id} onClick={() => setSelectedJob(job)}
              className={`px-2 py-1 rounded text-[10px] font-mono border transition-all active:scale-90 ${selectedJob?.id === job.id ? 'bg-blue-600 border-blue-400 text-white' : 'bg-slate-800 border-slate-700 text-slate-400'}`}>
              {job.id}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-grow w-full relative bg-slate-950 z-10">
        {!mapLoaded && <div className="absolute inset-0 flex items-center justify-center text-slate-600 font-mono text-xs z-40 bg-black">INITIALIZING SATELLITE...</div>}
        <div ref={mapContainer} className="absolute inset-0 w-full h-full" />
      </div>
      <div className="h-48 w-full bg-slate-900 border-t border-slate-800 p-5 flex flex-col justify-between flex-shrink-0 z-30 shadow-[0_-10px_30px_rgba(0,0,0,0.8)]">
        <div className="truncate">
          <p className="text-blue-500 text-[10px] font-bold font-mono uppercase tracking-tighter">{selectedJob?.borough || "QUEENS"}</p>
          <h2 className="text-white text-lg font-black truncate uppercase tracking-tight">{selectedJob?.address || "NO ADDRESS"}</h2>
        </div>
        <div className="grid grid-cols-2 gap-4 h-16 mb-2">
          <button className="bg-green-600 rounded-xl text-white font-black text-lg active:bg-green-700 active:scale-95 transition-all">DONE</button>
          <button className="bg-red-600 rounded-xl text-white font-black text-lg active:bg-red-700 active:scale-95 transition-all">SKIP</button>
        </div>
      </div>
    </div>
  );
}
