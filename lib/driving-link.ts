export function drivingLink(point: {lat:number;lng:number}) {
  if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng) || Math.abs(point.lat)>90 || Math.abs(point.lng)>180 || (point.lat===0&&point.lng===0)) return null;
  const url=new URL('https://www.google.com/maps/dir/');
  url.search=new URLSearchParams({api:'1',destination:`${point.lat},${point.lng}`,travelmode:'driving',dir_action:'navigate'}).toString();
  return url.href;
}

// The whole day in Google Maps: from the start through every stop in order, driving.
export function routeLink(points: {lat:number;lng:number}[]) {
  const ok = points.filter(p => drivingLink(p));
  if (ok.length < 2) return null;
  const [origin, ...rest] = ok;
  const url = new URL('https://www.google.com/maps/dir/');
  const params = new URLSearchParams({api:'1',travelmode:'driving',origin:`${origin.lat},${origin.lng}`,destination:`${rest[rest.length-1].lat},${rest[rest.length-1].lng}`});
  if (rest.length > 1) params.set('waypoints', rest.slice(0,-1).map(p=>`${p.lat},${p.lng}`).join('|'));
  url.search = params.toString();
  return url.href;
}

// Waze to one stop (same link as the job card's Waze button): opens the app and starts navigating.
export function wazeLink(point: {lat:number;lng:number}) {
  if (!drivingLink(point)) return null;
  return `https://waze.com/ul?ll=${point.lat},${point.lng}&navigate=yes`;
}
