import React, { useState } from 'react';
import { StatusBadge } from './StatusBadge';

export function JobsMapBoard({ jobs }) {
  const [selectedJob, setSelectedJob] = useState(jobs[0] || null);

  return (
    <div className="flex flex-col h-screen w-full bg-slate-900 overflow-hidden">
      
      {/* TOP SECTION: Horizontal Scroll for Job IDs / Filters */}
      <div className="h-20 flex-shrink-0 bg-slate-800 border-b border-slate-700 flex items-center px-4 space-x-3 overflow-x-auto whitespace-nowrap custom-scrollbar">
        {jobs.map((job) => (
          <button 
            key={job.id}
            onClick={() => setSelectedJob(job)}
            className={px-4 py-2 rounded-full text-xs font-mono border \}
          >
            {job.id}
          </button>
        ))}
      </div>

      {/* CENTER SECTION: Full Screen Map */}
      <div className="flex-1 relative bg-slate-950">
        {/* Map Layer */}
        <div className="absolute inset-0 bg-[url('https://api.mapbox.com/styles/v1/mapbox/dark-v10/static/-73.9,40.7,10,0/1000x1000?access_token=MAP_TOKEN')] bg-cover bg-center opacity-80">
            <div className="flex items-center justify-center h-full text-blue-500/50 text-sm italic">
                Interactive HPD Map: {selectedJob?.borough || 'Scanning NYC...'}
            </div>
        </div>
        
        {/* Floating ID Tag */}
        <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-slate-900/80 px-4 py-1 rounded-full border border-slate-700 text-blue-400 font-mono text-sm shadow-xl">
           {selectedJob?.id || "No Job Selected"}
        </div>
      </div>

      {/* BOTTOM SECTION: Scrollable Job Details & Actions */}
      <div className="h-1/3 flex-shrink-0 bg-slate-800 border-t border-slate-700 flex flex-col shadow-[0_-10px_20px_rgba(0,0,0,0.5)]">
        <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
          <div className="flex justify-between items-start">
            <div>
                <h2 className="text-white text-xl font-bold leading-tight">{selectedJob?.address}</h2>
                <p className="text-slate-400 text-sm">{selectedJob?.borough} — {selectedJob?.type}</p>
            </div>
            <StatusBadge status={selectedJob?.status} />
          </div>

          {/* Action Grid: Large buttons for one-handed field use */}
          <div className="grid grid-cols-2 gap-4 pt-2">
            <button className="bg-green-600 active:bg-green-700 h-16 rounded-2xl text-white font-bold shadow-lg">WORK COMPLETED</button>
            <button className="bg-red-600 active:bg-red-700 h-16 rounded-2xl text-white font-bold shadow-lg">REFUSED ACCESS</button>
            <button className="bg-yellow-600 h-16 rounded-2xl text-white font-bold shadow-lg">PARTIAL</button>
            <button className="bg-slate-600 h-16 rounded-2xl text-white font-bold shadow-lg">OTHERS</button>
          </div>

          <div className="border-t border-slate-700 pt-4">
             <p className="text-slate-500 text-xs uppercase tracking-widest font-bold">Project Logs</p>
             <div className="mt-2 text-slate-400 text-sm italic">
                Last filled: {selectedJob?.id}__20260212...
             </div>
          </div>
        </div>
      </div>

    </div>
  );
}
