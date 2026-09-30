export function drivingLink(point: {lat:number;lng:number}) {
  if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng) || Math.abs(point.lat)>90 || Math.abs(point.lng)>180 || (point.lat===0&&point.lng===0)) return null;
  const url=new URL('https://www.google.com/maps/dir/');
  url.search=new URLSearchParams({api:'1',destination:`${point.lat},${point.lng}`,travelmode:'driving',dir_action:'navigate'}).toString();
  return url.href;
}
