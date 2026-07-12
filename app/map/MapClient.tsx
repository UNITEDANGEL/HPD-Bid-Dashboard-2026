import { MapContainer, TileLayer, Polyline } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { UnifiedRouteState } from './MapWorkflowController';

interface MapClientProps {
  routeState: UnifiedRouteState;
}

export function MapClient({ routeState }: MapClientProps) {
  const hasRouteData = routeState.origin && routeState.stops.length > 0;
  
  // Create coordinate array: Origin -> Stop 1 -> Stop 2
  const allPoints = hasRouteData 
    ? [routeState.origin, ...routeState.stops.map(s => ({ lat: s.lat, lng: s.lng }))]
    : [];

  return (
    <div className="h-full w-full" style={{ minHeight: '100vh' }}>
      <MapContainer center={[40.7128, -74.0060]} zoom={11} style={{ height: '100%', width: '100%' }}>
        <TileLayer
          attribution='&copy; OpenStreetMap contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* 1. Review Mode: Show dashed line for entire route */}
        {routeState.stage === 'review' && hasRouteData && (
          <Polyline positions={allPoints} color="blue" dashArray="5, 10" />
        )}

        {/* 2. Active Mode: Show solid green line ONLY for the current leg */}
        {routeState.stage === 'active' && hasRouteData && routeState.stops[routeState.activeStopIndex] && (
          <Polyline 
            positions={[routeState.origin, routeState.stops[routeState.activeStopIndex]]} 
            color="#22c55e" 
            weight={6} 
          />
        )}
      </MapContainer>
    </div>
  );
}
export default MapClient;