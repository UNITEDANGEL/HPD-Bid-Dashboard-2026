"use client";
import React, { useState, useEffect } from 'react';
import Map, { Marker } from 'react-map-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
// SECURED: Token is safely hidden from GitHub scanners
const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
export function JobsMapBoard({ jobs }) {
  const [selectedJob, setSelectedJob] = useState(jobs?.[0]);
  const [viewState, setViewState] = useState({
    longitude: jobs?.[0]?.lng || -73.85,
    latitude: jobs?.[0]?.lat || 40.72,
    zoom: 14
  });
  useEffect(() => {
    if (selectedJob) {
      setViewState({
        longitude: selectedJob.lng,
        latitude: selectedJob.lat,
        zoom: 15
      });
    }
  }, [selectedJob]);
  if (!jobs?.length) return <div className="p-10 text-white font-mono">Scanning G: Drive for jobs...</div>;
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
      {/* CENTER: NATIVE MAPBOX GL */}
      <div className="flex-1 w-full bg-slate-950 relative">
        <Map
          {...viewState}
          onMove={evt => setViewState(evt.viewState)}
          mapStyle="mapbox://styles/mapbox/dark-v11"
          mapboxAccessToken={MAPBOX_TOKEN}
        >
          {jobs.map(job => (
            <Marker 
              key={job.id} 
              longitude={job.lng} 
              latitude={job.lat} 
              color={selectedJob?.id === job.id ? "#2563eb" : "#ef4444"} 
              onClick={(e) => {
                e.originalEvent.stopPropagation();
                setSelectedJob(job);
              }}
            />
          ))}
        </Map>
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
