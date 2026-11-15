// Say a note after each job (idea, 14 Nov): the words heard by the microphone become a job note, dated.
export function saidJobNote(heard: string, at: Date = new Date()): string {
  const words = String(heard || "").replace(/\s+/g, " ").trim();
  if (!words) return "";
  const day = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric" }).format(at);
  const text = words.charAt(0).toUpperCase() + words.slice(1);
  return `Done (${day}): ${text}${/[.!?]$/.test(text) ? "" : "."}`.slice(0, 300);
}
