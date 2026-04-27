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
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  useEffect(() => {
    if (!token || map.current || !mapContainer.current || !jobs?.length) return;
    mapboxgl.accessToken = token;
    try {
      map.current = new mapboxgl.Map({
        container: mapContainer.current,
        style: 'mapbox://styles/mapbox/dark-v11',
        center: [Number(jobs[0].lng), Number(jobs[0].lat)],
        zoom: 13
      });
      map.current.on('load', () => setMapLoaded(true));
      jobs.forEach((job) => {
        const el = document.createElement('div');
        el.style.cursor = 'pointer';
        el.innerHTML = `<div style="background-color: #1e293b; color: white; padding: 2px 8px; border-radius: 4px; font-family: monospace; font-size: 10px; border: 1px solid #334155;">${job.id}</div>`;
        el.onclick = () => setSelectedJob(job);
        new mapboxgl.Marker(el).setLngLat([Number(job.lng), Number(job.lat)]).addTo(map.current);
        markersRef.current.push({ id: job.id, el: el.firstChild });
      });
    } catch (err) { console.error(err); }
    return () => map.current?.remove();
  }, [jobs, token]);
  useEffect(() => {
    if (!map.current || !selectedJob) return;
    map.current.flyTo({ center: [Number(selectedJob.lng), Number(selectedJob.lat)], zoom: 15 });
    markersRef.current.forEach(({ id, el }) => {
      if (el) el.style.backgroundColor = id === selectedJob.id ? '#2563eb' : '#1e293b';
    });
  }, [selectedJob]);
  if (!token) return <div className="p-10 text-red-500 font-mono">MAPBOX TOKEN MISSING</div>;
  return (
    <div className="fixed inset-0 flex flex-col bg-black overflow-hidden">
      {/* HEADER: SCROLLABLE PILLS */}
      <div className="h-24 bg-slate-900 border-b border-slate-800 p-2 overflow-y-auto">
        <div className="flex flex-wrap gap-1">
          {jobs.map((job) => (
            <button 
              key={job.id} 
              onClick={() => setSelectedJob(job)}
              className={`px-2 py-1 rounded text-[10px] font-mono border transition-all ${
                selectedJob?.id === job.id ? 'bg-blue-600 border-blue-400 text-white' : 'bg-slate-800 border-slate-700 text-slate-500'
              }`}>
              {job.id}
            </button>
          ))}
        </div>
      </div>
      {/* MAP: FORCED 50% OF SCREEN */}
      <div className="flex-1 relative bg-slate-950">
        {!mapLoaded && <div className="absolute inset-0 flex items-center justify-center text-slate-500 font-mono text-xs">Loading NYC Map...</div>}
        <div ref={mapContainer} className="absolute inset-0" />
      </div>
      {/* FOOTER: ACTION CONSOLE */}
      <div className="h-[35%] bg-slate-900 border-t border-slate-800 p-5 flex flex-col justify-between shadow-2xl">
        <div>
          <h2 className="text-white text-lg font-black leading-tight uppercase">{selectedJob?.address}</h2>
          <p className="text-blue-500 text-xs font-mono font-bold mt-1">{selectedJob?.borough} • {selectedJob?.type}</p>
        </div>
        <div className="grid grid-cols-2 gap-3 mb-2">
          <button className="h-16 bg-green-600 active:bg-green-700 rounded-xl text-white font-black text-xl shadow-lg uppercase">COMPLETED</button>
          <button className="h-16 bg-red-600 active:bg-red-700 rounded-xl text-white font-black text-xl shadow-lg uppercase">REFUSED</button>
        </div>
      </div>
    </div>
  );
}
