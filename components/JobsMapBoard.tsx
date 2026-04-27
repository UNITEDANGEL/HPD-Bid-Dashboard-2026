"use client";
import React, { useState, useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
export function JobsMapBoard({ jobs }) {
  const [selectedJob, setSelectedJob] = useState(jobs?.[0]);
  const [mapLoaded, setMapLoaded] = useState(false);
  const mapContainer = useRef(null);
  const map = useRef(null);
  const markersRef = useRef([]);
  // 1. Safety Check: Only run if token exists
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  useEffect(() => {
    if (!token || map.current || !mapContainer.current || !jobs?.length) return;
    mapboxgl.accessToken = token;
    try {
      map.current = new mapboxgl.Map({
        container: mapContainer.current,
        style: 'mapbox://styles/mapbox/dark-v11',
        center: [Number(jobs[0].lng), Number(jobs[0].lat)],
        zoom: 14
      });
      map.current.on('load', () => setMapLoaded(true));
      jobs.forEach((job) => {
        const el = document.createElement('div');
        el.className = 'job-marker';
        el.style.cursor = 'pointer';
        el.innerHTML = `<div style="background-color: #1e293b; color: white; padding: 4px 10px; border-radius: 6px; font-family: monospace; font-size: 12px; font-weight: bold; border: 2px solid white;">${job.id}</div>`;
        el.onclick = () => setSelectedJob(job);
        new mapboxgl.Marker(el)
          .setLngLat([Number(job.lng), Number(job.lat)])
          .addTo(map.current);
        markersRef.current.push({ id: job.id, el: el.firstChild });
      });
    } catch (err) {
      console.error("Mapbox failed to initialize:", err);
    }
    return () => map.current?.remove();
  }, [jobs, token]);
  // Update UI selection
  useEffect(() => {
    if (!map.current || !selectedJob) return;
    map.current.flyTo({ center: [Number(selectedJob.lng), Number(selectedJob.lat)], zoom: 15 });
    markersRef.current.forEach(({ id, el }) => {
      if (el) el.style.backgroundColor = id === selectedJob.id ? '#2563eb' : '#1e293b';
    });
  }, [selectedJob]);
  if (!token) return <div className="p-10 text-red-500 font-mono">ERROR: NEXT_PUBLIC_MAPBOX_TOKEN missing in Render Settings.</div>;
  if (!jobs?.length) return <div className="p-10 text-white font-mono">Loading G: Drive jobs...</div>;
  return (
    <div className="flex flex-col h-screen w-full bg-black overflow-hidden">
      <div className="h-16 flex-shrink-0 bg-slate-900 border-b border-slate-800 flex items-center px-4 space-x-2 overflow-x-auto no-scrollbar">
        {jobs.map((job) => (
          <button key={job.id} onClick={() => setSelectedJob(job)}
            className={`flex-shrink-0 px-4 py-1.5 rounded-lg text-xs font-mono border transition-all ${
              selectedJob?.id === job.id ? 'bg-blue-600 border-blue-400 text-white' : 'bg-slate-800 border-slate-700 text-slate-500'
            }`}>
            {job.id}
          </button>
        ))}
      </div>
      <div className="flex-1 w-full bg-slate-950 relative">
        {!mapLoaded && <div className="absolute inset-0 flex items-center justify-center text-slate-500 font-mono">Initializing Map...</div>}
        <div ref={mapContainer} className="absolute inset-0" />
      </div>
      <div className="h-[42%] flex-shrink-0 bg-slate-900 border-t border-slate-800 p-6 flex flex-col shadow-2xl z-10">
        <h2 className="text-white text-xl font-black truncate">{selectedJob?.address}</h2>
        <p className="text-slate-500 text-xs font-mono uppercase mb-4">{selectedJob?.borough} • {selectedJob?.type}</p>
        <div className="grid grid-cols-2 gap-4 flex-1">
          <button className="bg-green-600 rounded-2xl text-white font-black text-lg shadow-lg">COMPLETED</button>
          <button className="bg-red-600 rounded-2xl text-white font-black text-lg shadow-lg">REFUSED</button>
        </div>
      </div>
    </div>
  );
}
