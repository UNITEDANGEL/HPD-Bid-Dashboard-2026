// No-access proof in one tap (idea, 14 Nov): the note saved on the job when the door stays closed:
// the time, how many door photos were taken and the call tries, so the no-access paperwork is ready.
export function noAccessProofNote(opts: { at?: Date; photos: number; callTries?: number }): string {
  const at = opts.at || new Date();
  const time = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(at);
  const photos = Math.max(0, Math.floor(opts.photos || 0));
  const tries = Math.max(0, Math.floor(opts.callTries || 0));
  const photoText = photos === 1 ? "1 door photo" : photos > 1 ? `${photos} door photos` : "no door photo";
  const callText = tries === 1 ? "1 call try" : `${tries} call tries`;
  return `No access proof: ${time}, ${photoText}, ${callText}.`;
}
