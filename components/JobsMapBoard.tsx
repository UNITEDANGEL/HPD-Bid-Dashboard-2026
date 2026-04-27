import React, { useState } from 'react';
import { StatusBadge } from './StatusBadge';

export function JobsMapBoard({ jobs }) {
  const [selectedJob, setSelectedJob] = useState(null);

  return (
    <div className="flex h-screen w-full bg-slate-900 overflow-hidden">
      {/* LEFT SIDE: Scrollable Job List */}
      <div className="w-full md:w-1/3 lg:w-1/4 h-full flex flex-col border-r border-slate-700 bg-slate-800">
        <div className="p-4 border-b border-slate-700">
          <h1 className="text-xl font-bold text-white">HPD Work Orders</h1>
          <p className="text-slate-400 text-sm">{jobs.length} Active Jobs Found</p>
        </div>
        
        <div className="flex-1 overflow-y-auto p-2 space-y-2 custom-scrollbar">
          {jobs.map((job) => (
            <div 
              key={job.id}
              onClick={() => setSelectedJob(job)}
              className="p-4 bg-slate-700 rounded-xl cursor-pointer hover:bg-slate-600 transition-colors border border-transparent active:border-blue-500"
            >
              <div className="flex justify-between items-start">
                <span className="font-mono text-blue-400 text-xs">{job.id}</span>
                <StatusBadge status={job.status} />
              </div>
              <h3 className="text-white font-semibold mt-1">{job.address}</h3>
              <p className="text-slate-400 text-xs mt-1">{job.borough} - {job.type}</p>
            </div>
          ))}
        </div>
      </div>

      {/* CENTER/RIGHT: Full Screen Map */}
      <div className="flex-1 relative h-full bg-slate-900">
        {/* This is where your Google Map component lives */}
        <div className="absolute inset-0 bg-[url('https://api.mapbox.com/styles/v1/mapbox/dark-v10/static/-73.9,40.7,10,0/1000x1000?access_token=YOUR_TOKEN')] bg-cover bg-center">
            {/* Map Pins would render over this */}
            <div className="flex items-center justify-center h-full text-slate-500 italic">
                Interactive Google Map Layer Loading...
            </div>
        </div>

        {/* Mobile Overlay: If a job is selected, show details on phone */}
        {selectedJob && (
          <div className="absolute bottom-4 left-4 right-4 md:left-auto md:w-96 bg-slate-800 p-6 rounded-2xl shadow-2xl border border-slate-600 animate-in slide-in-from-bottom">
             <button onClick={() => setSelectedJob(null)} className="absolute top-2 right-4 text-slate-400">?</button>
             <h2 className="text-white text-lg font-bold">{selectedJob.address}</h2>
             <div className="grid grid-cols-2 gap-2 mt-4">
                <button className="bg-green-600 p-3 rounded-lg text-white text-sm font-bold">COMPLETED</button>
                <button className="bg-red-600 p-3 rounded-lg text-white text-sm font-bold">REFUSED</button>
             </div>
          </div>
        )}
      </div>
    </div>
  );
}
