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
    if (!MAPBOX_TOKEN || map.current || !mapContainer.current || !jobs?.length) return;
    mapboxgl.accessToken = MAPBOX_TOKEN;
    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: [Number(jobs[0].lng), Number(jobs[0].lat)],
      zoom: 12,
      pitch: 45
    });
    map.current.on('load', () => setMapLoaded(true));
    jobs.forEach((job) => {
      const el = document.createElement('div');
      el.style.cursor = 'pointer';
      el.innerHTML = `<div style="background-color: #1e293b; color: white; padding: 2px 6px; border-radius: 4px; font-family: monospace; font-size: 10px; border: 1px solid #475569; white-space: nowrap;">${job.id}</div>`;
      el.onclick = () => setSelectedJob(job);
      const marker = new mapboxgl.Marker(el).setLngLat([Number(job.lng), Number(job.lat)]).addTo(map.current);
      markersRef.current.push({ id: job.id, el: el.firstChild, marker });
    });
    return () => map.current?.remove();
  }, [jobs]);
  useEffect(() => {
    if (!map.current || !selectedJob) return;
    map.current.flyTo({ center: [Number(selectedJob.lng), Number(selectedJob.lat)], zoom: 15, essential: true });
    markersRef.current.forEach(({ id, el }) => {
      if (el) {
        el.style.backgroundColor = id === selectedJob.id ? '#2563eb' : '#1e293b';
        el.style.borderColor = id === selectedJob.id ? '#60a5fa' : '#475569';
        el.style.zIndex = id === selectedJob.id ? '10' : '1';
      }
    });
  }, [selectedJob]);
  if (!MAPBOX_TOKEN) return <div className="p-10 text-red-500">ERROR: TOKEN MISSING</div>;
  if (!jobs?.length) return <div className="p-10 text-white">LOADING JOBS...</div>;
  return (
    <div className="fixed inset-0 h-screen w-full flex flex-col bg-black overflow-hidden">
      <div className="h-28 w-full bg-slate-900 border-b border-slate-800 p-3 overflow-y-auto flex-shrink-0 z-20">
        <div className="flex flex-wrap gap-2">
          {jobs.map((job) => (
            <button key={job.id} onClick={() => setSelectedJob(job)}
              className={`px-2 py-1 rounded text-[10px] font-mono border ${selectedJob?.id === job.id ? 'bg-blue-600 border-blue-400 text-white shadow-lg' : 'bg-slate-800 border-slate-700 text-slate-400'}`}>
              {job.id}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-grow w-full relative bg-slate-950 z-10">
        {!mapLoaded && <div className="absolute inset-0 flex items-center justify-center text-slate-600 font-mono text-xs z-30">LOADING...</div>}
        <div ref={mapContainer} className="absolute inset-0 w-full h-full" />
      </div>
      <div className="h-52 w-full bg-slate-900 border-t border-slate-800 p-5 flex flex-col justify-between flex-shrink-0 z-20">
        <div>
          <p className="text-blue-500 text-[10px] font-bold font-mono uppercase mb-1">{selectedJob?.borough}</p>
          <h2 className="text-white text-xl font-black truncate uppercase tracking-tight">{selectedJob?.address}</h2>
        </div>
        <div className="grid grid-cols-2 gap-4 h-20">
          <button className="bg-green-600 rounded-xl text-white font-black text-xl uppercase active:scale-95 transition-all">DONE</button>
          <button className="bg-red-600 rounded-xl text-white font-black text-xl uppercase active:scale-95 transition-all">SKIP</button>
        </div>
      </div>
    </div>
  );
}
