export type DayAgentRouteLeg = {
  from: string;
  to: string;
  label: string;
  durationSeconds: number;
  distanceMeters: number;
  midpoint: { lat: number; lng: number };
};

export type DayAgentRouteSummary = {
  mode: "road" | "fallback";
  message: string;
  startedFrom: string;
  returnedToBase: boolean;
  totalDurationSeconds: number;
  totalDistanceMeters: number;
  legs: DayAgentRouteLeg[];
};

export const estimateDayAgentStopMinutes = (description: string, location = "", defaultMinutes = 40) => {
  const text = `${description} ${location}`.toLowerCase();
  let minutes = defaultMinutes;
  if (/paint|plaster|sheetrock|ceiling|wall/.test(text)) minutes += 20;
  if (/door|lock|hinge|window/.test(text)) minutes += 10;
  if (/electrical|outlet|switch|fixture|plumb|pipe|faucet|toilet/.test(text)) minutes += 15;
  if (/multiple|throughout|entire|all rooms|several/.test(text)) minutes += 15;
  if (/inspect|inspection|affidavit|no access/.test(text)) minutes -= 10;
  return Math.max(25, Math.min(90, minutes));
};

export const formatDayAgentDistance = (meters: number) => {
  if (!Number.isFinite(meters) || meters <= 0) return "0 mi";
  const miles = meters / 1609.344;
  return miles < 10 ? `${miles.toFixed(1)} mi` : `${Math.round(miles)} mi`;
};

export const formatDayAgentDuration = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0 min";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remain = minutes % 60;
  return remain ? `${hours}h ${remain}m` : `${hours}h`;
};

export const formatDayAgentLegLabel = (seconds: number, meters: number) =>
  `${formatDayAgentDuration(seconds)} away · ${formatDayAgentDistance(meters)}`;

export const formatDayAgentCompactLegLabel = (seconds: number, meters: number) => {
  const minutes = Math.max(1, Math.round(seconds / 60));
  const time = minutes < 60 ? `${minutes}m` : formatDayAgentDuration(seconds);
  return `${time} · ${formatDayAgentDistance(meters)}`;
};

export const isFreshRouteLocation = (location?: { updatedAt?: string } | null, now = Date.now()) => {
  if (!location?.updatedAt) return false;
  const updatedAt = Date.parse(location.updatedAt);
  return Number.isFinite(updatedAt) && now - updatedAt < 2 * 60 * 1000;
};
