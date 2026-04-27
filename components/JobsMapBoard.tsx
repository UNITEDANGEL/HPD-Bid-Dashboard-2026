"use client";
import React, { useState } from 'react';
export function JobsMapBoard({ jobs }) {
  const [selectedJob, setSelectedJob] = useState(jobs?.[0]);
  if (!jobs?.length) return <div className="p-10 text-white">Scanning G: Drive for jobs...</div>;
  // FIXED: Clean Google Maps Directions Link
  const openDirections = () => {
    const url = `https://maps.google.com/maps?daddr=${encodeURIComponent(selectedJob.address)}`;
    window.open(url, '_blank');
  };
  // FIXED: Clean Google Maps Embed Link
  const mapUrl = `https://maps.google.com/maps?q=${selectedJob.lat},${selectedJob.lng}&t=m&z=15&output=embed`;
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
      {/* CENTER: BULLETPROOF GOOGLE MAPS EMBED (FIXED URL) */}
      <div className="flex-1 w-full bg-slate-950">
        <iframe 
          width="100%" 
          height="100%" 
          style={{ border: 0 }}
          loading="lazy"
          allowFullScreen
          referrerPolicy="no-referrer-when-downgrade"
          src={mapUrl}
        ></iframe>
      </div>
      {/* BOTTOM: ACTION CONSOLE */}
      <div className="h-[42%] flex-shrink-0 bg-slate-900 border-t border-slate-800 p-6 flex flex-col shadow-2xl z-10">
        <div className="mb-4 flex justify-between items-start">
            <div className="max-w-[70%]">
                <a href={`https://maps.google.com/maps?q=${encodeURIComponent(selectedJob.address)}`} target="_blank" rel="noreferrer" className="text-white text-xl font-black truncate block hover:text-blue-400 transition-colors">
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
