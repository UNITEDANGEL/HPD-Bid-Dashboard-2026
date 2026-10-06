// The app's space on this phone: how much the saved jobs, photos and videos use, how much is
// left, and whether the phone has agreed to keep them (not clear them when space runs low).
export type StorageLevel = "ok" | "low" | "full";
export type PhoneStorage = { usage: number; quota: number; free: number; percent: number; persisted: boolean | null; level: StorageLevel };

const MB = 1024 * 1024;
// Low: 80% used or under 500 MB left (a few videos). Full: 95% used or under 150 MB left.
export function storageLevel(usage: number, quota: number): StorageLevel {
  if (!quota) return "ok";
  const free = Math.max(0, quota - usage);
  if (usage / quota >= 0.95 || free < 150 * MB) return "full";
  if (usage / quota >= 0.8 || free < 500 * MB) return "low";
  return "ok";
}

export function formatBytes(bytes: number) {
  if (bytes >= 1024 * MB) return `${(bytes / (1024 * MB)).toFixed(1)} GB`;
  if (bytes >= MB) return `${Math.round(bytes / MB)} MB`;
  return `${Math.max(0, Math.round(bytes / 1024))} KB`;
}

export async function phoneStorage(): Promise<PhoneStorage | null> {
  if (typeof navigator === "undefined" || !navigator.storage?.estimate) return null;
  try {
    const { usage = 0, quota = 0 } = await navigator.storage.estimate();
    const persisted = navigator.storage.persisted ? await navigator.storage.persisted() : null;
    return { usage, quota, free: Math.max(0, quota - usage), percent: quota ? Math.round((usage / quota) * 100) : 0, persisted, level: storageLevel(usage, quota) };
  } catch {
    return null;
  }
}

// Asks the phone to keep the app's data. Safari and Chrome decide on their own (no pop-up);
// an app added to the Home Screen is usually allowed.
export async function keepAppData(): Promise<boolean | null> {
  if (typeof navigator === "undefined" || !navigator.storage?.persist) return null;
  try {
    if (navigator.storage.persisted && await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return null;
  }
}
