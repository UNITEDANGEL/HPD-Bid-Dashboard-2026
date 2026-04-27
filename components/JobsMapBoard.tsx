"use client";

import React, { useState } from 'react';

const StatusBadge = ({ status }) => {
  const styles = {
    'COMPLETED': 'bg-green-900/30 text-green-400 border-green-500/50',
    'REFUSED': 'bg-red-900/30 text-red-400 border-red-500/50',
    'PENDING': 'bg-blue-900/30 text-blue-400 border-blue-500/50'
  };
  return (
    <span className={`px-2 py-1 rounded text-[10px] font-bold border ${styles[status] || styles['PENDING']}`}>
      {status}
    </span>
  );
};

export function JobsMapBoard({ jobs }) {
  const [selectedJob, setSelectedJob] = useState(jobs && jobs.length > 0 ? jobs[0] : null);

  if (!jobs || jobs.length === 0) return <div className="p-10 text-white">No jobs found.</div>;

  return (
    <div className="flex flex-col h-screen w-full bg-black overflow-hidden">
      
      {/* TOP: Horizontal ID Scroller (Fixed Height) */}
      <div className="h-16 flex-shrink-0 bg-slate-900 border-b border-slate-800 flex items-center px-4 space-x-2 overflow-x-auto no-scrollbar">
        {jobs.map((job) => (
          <button 
            key={job.id}
            onClick={() => setSelectedJob(job)}
            className={`flex-shrink-0 px-4 py-1.5 rounded-lg text-xs font-mono border transition-all ${
              selectedJob?.id === job.id 
              ? 'bg-blue-600 border-blue-400 text-white shadow-lg' 
              : 'bg-slate-800 border-slate-700 text-slate-500'
            }`}
          >
            {job.id}
          </button>
        ))}
      </div>

      {/* MIDDLE: FULL SCREEN MAP (Flex-1 fills all center space) */}
      <div className="flex-1 relative bg-slate-950">
        <div className="absolute inset-0 bg-[url('https://api.mapbox.com/styles/v1/mapbox/dark-v10/static/-73.8,40.7,11,0/1000x1000?access_token=pk.ey')] bg-cover bg-center">
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10">
                <div className="bg-slate-900/90 backdrop-blur-md px-6 py-2 rounded-2xl border border-slate-700 text-white font-bold text-sm shadow-2xl">
                   {selectedJob?.address || "CENTERING MAP..."}
                </div>
            </div>
            {/* The pulsing GPS dot for the selected job */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
                <div className="w-4 h-4 bg-blue-500 rounded-full animate-ping opacity-75"></div>
                <div className="w-4 h-4 bg-blue-600 rounded-full relative z-20 border-2 border-white"></div>
            </div>
        </div>
      </div>

      {/* BOTTOM: Action Console (Fixed Height) */}
      <div className="h-[40%] flex-shrink-0 bg-slate-900 border-t border-slate-800 p-6 flex flex-col shadow-[0_-20px_40px_rgba(0,0,0,0.7)]">
        <div className="flex justify-between items-start mb-4">
            <div className="max-w-[75%]">
                <h2 className="text-white text-xl font-black truncate">{selectedJob?.address}</h2>
                <p className="text-slate-500 text-xs font-mono uppercase">{selectedJob?.borough} • {selectedJob?.type}</p>
            </div>
            <StatusBadge status={selectedJob?.status} />
        </div>

        {/* The Field Action Buttons */}
        <div className="grid grid-cols-2 gap-4 flex-1">
            <button className="bg-green-600 active:scale-95 rounded-2xl text-white font-black text-lg shadow-lg flex items-center justify-center">
                COMPLETED
            </button>
            <button className="bg-red-600 active:scale-95 rounded-2xl text-white font-black text-lg shadow-lg flex items-center justify-center">
                REFUSED
            </button>
            <button className="bg-slate-800 rounded-xl text-slate-300 font-bold text-sm border border-slate-700">
                PARTIAL
            </button>
            <button className="bg-slate-800 rounded-xl text-slate-300 font-bold text-sm border border-slate-700">
                OTHERS
            </button>
        </div>
      </div>

    </div>
  );
}
