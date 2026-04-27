"use client";
import React, { useState } from 'react';

export function JobsMapBoard({ jobs }) {
  const [selectedJob, setSelectedJob] = useState(jobs && jobs.length > 0 ? jobs[0] : null);
  if (!jobs || jobs.length === 0) return <div className="p-10 text-white">No jobs found. Scanning...</div>;

  return (
    <div className="flex flex-col h-screen w-full bg-black overflow-hidden">
      {/* TOP: NAVIGATION */}
      <div className="h-16 flex-shrink-0 bg-slate-900 border-b border-slate-800 flex items-center px-4 space-x-2 overflow-x-auto no-scrollbar">
        {jobs.map((job) => (
          <button key={job.id} onClick={() => setSelectedJob(job)}
            className={`flex-shrink-0 px-4 py-1.5 rounded-lg text-xs font-mono border ${selectedJob?.id === job.id ? 'bg-blue-600 border-blue-400 text-white' : 'bg-slate-800 border-slate-700 text-slate-500'}`}>
            {job.id}
          </button>
        ))}
      </div>

      {/* CENTER: THE MAP */}
      <div className="flex-1 relative bg-slate-950 flex items-center justify-center">
        <div className="absolute inset-0 bg-[url('https://api.mapbox.com/styles/v1/mapbox/dark-v10/static/-73.9,40.7,11,0/1000x1000?access_token=pk.ey')] bg-cover bg-center opacity-40"></div>
        <div className="z-10 bg-slate-900/90 px-6 py-2 rounded-full border border-slate-700 text-white font-bold text-sm shadow-2xl">
           {selectedJob?.address || "CENTERING MAP..."}
        </div>
      </div>

      {/* BOTTOM: ACTION CONSOLE */}
      <div className="h-[40%] flex-shrink-0 bg-slate-900 border-t border-slate-800 p-6 flex flex-col shadow-2xl">
        <div className="mb-4">
            <h2 className="text-white text-xl font-black truncate">{selectedJob?.address}</h2>
            <p className="text-slate-500 text-xs font-mono uppercase">{selectedJob?.borough} • {selectedJob?.type}</p>
        </div>
        <div className="grid grid-cols-2 gap-4 flex-1">
            <button className="bg-green-600 active:scale-95 rounded-2xl text-white font-black text-lg shadow-lg">COMPLETED</button>
            <button className="bg-red-600 active:scale-95 rounded-2xl text-white font-black text-lg shadow-lg">REFUSED</button>
        </div>
      </div>
    </div>
  );
}
