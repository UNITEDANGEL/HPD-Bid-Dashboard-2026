"use client";
import React, { useState, useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
// SECURED: Native token assignment
mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
export function JobsMapBoard({ jobs }) {
  const [selectedJob, setSelectedJob] = useState(jobs?.[0]);
  const mapContainer = useRef(null);
  const map = useRef(null);
  const markersRef = useRef([]);
  // Initialize Map and Markers exactly once
  useEffect(() => {
    if (map.current || !mapContainer.current || !jobs?.length) return;
    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: [jobs[0].lng, jobs[0].lat],
      zoom: 14
    });
    jobs.forEach((job) => {
      const el = document.createElement('div');
      el.style.backgroundColor = selectedJob?.id === job.id ? '#2563eb' : '#ef4444';
      el.style.width = '20px';
      el.style.height = '20px';
      el.style.borderRadius = '50%';
      el.style.border = '2px solid white';
      el.style.boxShadow = '0 0 10px rgba(0,0,0,0.5)';
      el.style.cursor = 'pointer';
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        setSelectedJob(job);
      });
      const marker = new mapboxgl.Marker(el)
        .setLngLat([job.lng, job.lat])
        .addTo(map.current);
      markersRef.current.push({ id: job.id, marker, el });
    });
  }, [jobs]);
  // Fly to job and update marker colors when selection changes
  useEffect(() => {
    if (!map.current || !selectedJob) return;
    map.current.flyTo({
      center: [selectedJob.lng, selectedJob.lat],
      zoom: 15,
      essential: true
    });
    markersRef.current.forEach(({ id, el }) => {
      el.style.backgroundColor = id === selectedJob.id ? '#2563eb' : '#ef4444';
      el.style.transform = id === selectedJob.id ? 'scale(1.2)' : 'scale(1)';
      el.style.transition = 'all 0.2s ease';
      el.style.zIndex = id === selectedJob.id ? '1' : '0';
    });
  }, [selectedJob]);
  if (!jobs?.length) return <div className="p-10 text-white font-mono">Scanning G: Drive for jobs...</div>;
  // OFFICIAL GOOGLE ROUTING LINKS
  const openDirections = () => {
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${selectedJob.lat},${selectedJob.lng}`, '_blank');
  };
  const searchUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(selectedJob.address)}`;
  return (
    <div className="flex flex-col h-screen w-full bg-black overflow-hidden">
      {/* TOP: NAVIGATION */}
      <div className="h-16 flex-shrink-0 bg-slate-900 border-b border-slate-800 flex items-center px-4 space-x-2 overflow-x-auto no-scrollbar">
        {jobs.map((job) => (
          <button key={job.id} onClick={() => setSelectedJob(job)}
            className={`flex-shrink-0 px-4 py-1.5 rounded-lg text-xs font-mono border transition-all ${
              selectedJob?.id === job.id ? 'bg-blue-600 border-blue-400 text-white shadow-lg' : 'bg-slate-800 border-slate-700 text-slate-500'
            }`}>
            {job.id}
          </button>
        ))}
      </div>
      {/* CENTER: NATIVE MAPBOX GL (No Wrapper) */}
      <div className="flex-1 w-full bg-slate-950 relative">
        <div ref={mapContainer} style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0 }} />
      </div>
      {/* BOTTOM: ACTION CONSOLE */}
      <div className="h-[42%] flex-shrink-0 bg-slate-900 border-t border-slate-800 p-6 flex flex-col shadow-2xl z-10">
        <div className="mb-4 flex justify-between items-start">
            <div className="max-w-[70%]">
                <a href={searchUrl} target="_blank" rel="noreferrer" className="text-white text-xl font-black truncate block hover:text-blue-400 transition-colors">
                    {selectedJob?.address} ↗
                </a>
                <p className="text-slate-500 text-xs font-mono uppercase mt-1">{selectedJob?.borough} • {selectedJob?.type}</p>
            </div>
            <button onClick={openDirections} className="bg-blue-600/20 text-blue-400 border border-blue-500/50 px-3 py-2 rounded-lg text-[10px] font-bold tracking-wider">
                NAVIGATE
            </button>
        </div>
        <div className="grid grid-cols-2 gap-4 flex-1">
            <button className="bg-green-600 active:scale-95 rounded-2xl text-white font-black text-lg shadow-lg flex items-center justify-center">
                COMPLETED
            </button>
            <button className="bg-red-600 active:scale-95 rounded-2xl text-white font-black text-lg shadow-lg flex items-center justify-center">
                REFUSED
            </button>
            <button className="bg-slate-800 rounded-xl text-slate-300 font-bold text-sm border border-slate-700 active:bg-slate-700">PARTIAL</button>
            <button className="bg-slate-800 rounded-xl text-slate-300 font-bold text-sm border border-slate-700 active:bg-slate-700">OTHERS</button>
        </div>
      </div>
    </div>
  );
}
