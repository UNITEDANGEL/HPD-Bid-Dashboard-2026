"use client";

import React, { useState } from 'react';

const StatusBadge = ({ status }) => {
  const colors = {
    'COMPLETED': 'bg-green-500/20 text-green-400 border-green-500/50',
    'REFUSED': 'bg-red-500/20 text-red-400 border-red-500/50',
    'PENDING': 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50',
    'DEFAULT': 'bg-slate-500/20 text-slate-400 border-slate-500/50'
  };
  const style = colors[status] || colors['DEFAULT'];
  return (
    <span className={`px-2 py-1 rounded text-[10px] font-bold border ${style}`}>
      {status}
    </span>
  );
};

export function JobsMapBoard({ jobs }) {
  const [selectedJob, setSelectedJob] = useState(jobs && jobs.length > 0 ? jobs[0] : null);

  if (!jobs || jobs.length === 0) return <div className="p-10 text-white">No jobs found. Scanning HPD Database...</div>;

  return (
    <div className="flex flex-col h-screen w-full bg-slate-900 overflow-hidden">
      
      {/* TOP SECTION: Horizontal Scroll */}
      <div className="h-20 flex-shrink-0 bg-slate-800 border-b border-slate-700 flex items-center px-4 space-x-3 overflow-x-auto whitespace-nowrap scrollbar-hide">
        {jobs.map((job) => (
          <button 
            key={job.id}
            onClick={() => setSelectedJob(job)}
            className={`px-4 py-2 rounded-full text-xs font-mono border transition-all ${
              selectedJob?.id === job.id 
              ? 'bg-blue-600 border-blue-400 text-white shadow-[0_0_15px_rgba(37,99,235,0.4)]' 
              : 'bg-slate-700 border-slate-600 text-slate-400'
            }`}
          >
            {job.id}
          </button>
        ))}
      </div>

      {/* CENTER SECTION: Map View Placeholder */}
      <div className="flex-1 relative bg-slate-950 flex items-center justify-center">
        <div className="absolute inset-0 bg-[url('https://api.mapbox.com/styles/v1/mapbox/dark-v10/static/-73.9,40.7,11,0/1000x1000?access_token=pk.ey')] bg-cover bg-center opacity-40"></div>
        <div className="z-10 text-center">
            <div className="text-blue-500 font-mono text-xs mb-2 italic">GPS LOCK: {selectedJob?.borough || 'NEW YORK'}</div>
            <div className="bg-slate-900/90 px-6 py-2 rounded-full border border-slate-700 text-white font-bold text-sm shadow-2xl">
               {selectedJob?.address || "CENTERING MAP..."}
            </div>
        </div>
      </div>

      {/* BOTTOM SECTION: Job Details & Action Matrix */}
      <div className="h-[45%] flex-shrink-0 bg-slate-800 border-t border-slate-700 flex flex-col shadow-[0_-15px_30px_rgba(0,0,0,0.6)]">
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          <div className="flex justify-between items-start">
            <div className="max-w-[70%]">
                <h2 className="text-white text-2xl font-bold leading-tight">{selectedJob?.address}</h2>
                <p className="text-blue-400 font-mono text-xs mt-1 uppercase tracking-tighter">
                  {selectedJob?.id} • {selectedJob?.type}
                </p>
            </div>
            <StatusBadge status={selectedJob?.status || 'PENDING'} />
          </div>

          {/* Action Grid: High-Visibility buttons */}
          <div className="grid grid-cols-2 gap-4">
            <button className="bg-green-600 active:scale-95 h-20 rounded-2xl text-white font-black text-lg shadow-lg flex items-center justify-center">
              COMPLETED
            </button>
            <button className="bg-red-600 active:scale-95 h-20 rounded-2xl text-white font-black text-lg shadow-lg flex items-center justify-center">
              REFUSED
            </button>
            <button className="bg-amber-600 h-16 rounded-xl text-white font-bold shadow-md">
              PARTIAL
            </button>
            <button className="bg-slate-600 h-16 rounded-xl text-white font-bold shadow-md">
              BY OTHERS
            </button>
          </div>

          <div className="border-t border-slate-700 pt-4 pb-12">
             <div className="flex justify-between items-center">
               <p className="text-slate-500 text-[10px] uppercase font-black tracking-widest">History Logs (G: Drive)</p>
               <span className="text-blue-500 text-[10px] font-mono">2026.SYNC.ON</span>
             </div>
             <div className="mt-3 bg-slate-900/50 p-4 rounded-xl border border-slate-700/50">
                <p className="text-slate-400 text-xs italic">Searching for templates: {selectedJob?.id}...</p>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
}
