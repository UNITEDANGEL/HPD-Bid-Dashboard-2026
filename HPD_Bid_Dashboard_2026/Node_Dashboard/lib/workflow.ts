export function normalizeStatus(status: string) {
  return String(status || "Pending").trim().toLowerCase();
}

export function isTerminalStatus(status: string) {
  const normalized = normalizeStatus(status);
  return (
    normalized.includes("completed") ||
    normalized.includes("refused access") ||
    normalized.includes("no access - 2nd") ||
    normalized.includes("no access 2nd")
  );
}

export function shouldAutoArchiveStatus(status: string) {
  return isTerminalStatus(status);
}

export function isMainMapStatus(status: string) {
  const normalized = normalizeStatus(status);
  return normalized === "pending" || normalized === "";
}
