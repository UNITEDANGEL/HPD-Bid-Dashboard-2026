import React from 'react';
import { UnifiedRouteState } from './MapWorkflowController';

interface SidebarProps {
  routeState: UnifiedRouteState;
  onRouteReady: (jobs: any[], loc: any) => void;
  onStart: () => void;
  onNext: () => void;
}

export function Sidebar({ routeState, onRouteReady, onStart, onNext }: SidebarProps) {
  return (
    <div className="w-80 h-full bg-slate-50 border-r border-slate-200 p-4 flex flex-col gap-4 z-[1000] relative shadow-md">
      <h2 className="text-lg font-bold text-slate-800">Dispatch Command</h2>
      
      <div className="text-sm font-medium text-slate-500 uppercase tracking-wider">
        System Status: {routeState.stage}
      </div>

      {routeState.stage === 'planning' && (
        <button
          onClick={() => onRouteReady([{ lat: 40.75, lng: -73.98, jobId: 'TEST-1', address: 'Times Sq' }], { lat: 40.7128, lng: -74.0060 })}
          className="px-4 py-3 bg-blue-600 text-white rounded-md shadow hover:bg-blue-700 transition-colors"
        >
          Load Test Route
        </button>
      )}

      {routeState.stage === 'review' && (
        <button
          onClick={onStart}
          className="px-4 py-3 bg-green-600 text-white rounded-md shadow hover:bg-green-700 font-bold transition-colors"
        >
          START ROUTE
        </button>
      )}

      {routeState.stage === 'active' && (
        <button
          onClick={onNext}
          className="px-4 py-3 bg-slate-800 text-white rounded-md shadow hover:bg-slate-900 transition-colors"
        >
          Advance to Next Stop
        </button>
      )}
    </div>
  );
}