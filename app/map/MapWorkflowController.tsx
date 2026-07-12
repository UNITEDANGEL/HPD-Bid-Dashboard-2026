import { useState } from 'react';
import { MapClient } from './MapClient';
import { Sidebar } from './Sidebar';

export interface UnifiedRouteState {
  stage: 'planning' | 'review' | 'active' | 'completed';
  origin: { lat: number; lng: number } | null;
  stops: Array<{ jobId: string; address: string; lat: number; lng: number }>;
  activeStopIndex: number;
}

export function MapWorkflowController() {
  const [routeState, setRouteState] = useState<UnifiedRouteState>({
    stage: 'planning',
    origin: null,
    stops: [],
    activeStopIndex: 0
  });

  const handleRouteReady = (selectedJobs: any[], userLocation: any) => {
    setRouteState({
      stage: 'review',
      origin: userLocation,
      stops: selectedJobs,
      activeStopIndex: 0
    });
  };

  const startNavigation = () => setRouteState(prev => ({ ...prev, stage: 'active' }));
  const nextStop = () => setRouteState(prev => ({ ...prev, activeStopIndex: prev.activeStopIndex + 1 }));

  return (
    <div className="flex h-screen w-full">
      <Sidebar 
        routeState={routeState} 
        onRouteReady={handleRouteReady} 
        onStart={startNavigation} 
        onNext={nextStop} 
      />
      {/* MapClient now purely reads this single state. No more overlapping overlays. */}
      <MapClient routeState={routeState} />
    </div>
  );
}
export default MapWorkflowController;