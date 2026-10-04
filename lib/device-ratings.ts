// Ratings made on this device, kept only in this browser (localStorage), never on the server: the school
// and the private code that changes or withdraws the rating. Onus stores no link between an account and a
// rating, so this list is the only place the two meet, and only on the person's own device.
export type DeviceRating = { slug: string; school: string; code: string; saved: string };
const KEY = "onus.ratings.v1";
const EVENT = "onus-ratings-change";

// For useSyncExternalStore: the stored text (stable between changes), and a subscription that fires when
// this tab or another tab changes the list. On the server there is no list (null).
export const deviceRatingsSnapshot = () => { try { return localStorage.getItem(KEY) ?? "[]"; } catch { return "[]"; } };
export const deviceRatingsServerSnapshot = () => null;
export function subscribeDeviceRatings(cb: () => void) {
  const onStorage = (e: StorageEvent) => { if (e.key === KEY) cb(); };
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", onStorage);
  return () => { window.removeEventListener(EVENT, cb); window.removeEventListener("storage", onStorage); };
}
const changed = () => { try { window.dispatchEvent(new Event(EVENT)); } catch { /* no window */ } };

export function parseDeviceRatings(text: string | null): DeviceRating[] {
  try {
    const v = JSON.parse(text ?? "[]");
    return Array.isArray(v) ? v.filter((r) => r && typeof r.slug === "string" && /^[A-Z0-9]{8}$/.test(r.code)) : [];
  } catch { return []; }
}
export const readDeviceRatings = () => parseDeviceRatings(deviceRatingsSnapshot());
/** Returns false when this browser can't keep it (private mode, storage blocked or full). */
export function saveDeviceRating(r: DeviceRating): boolean {
  try {
    const list = readDeviceRatings().filter((x) => x.slug !== r.slug);
    localStorage.setItem(KEY, JSON.stringify([...list, r]));
    changed();
    return readDeviceRatings().some((x) => x.code === r.code);
  } catch { return false; }
}
export function removeDeviceRating(code: string) {
  try { localStorage.setItem(KEY, JSON.stringify(readDeviceRatings().filter((x) => x.code !== code))); changed(); } catch { /* nothing kept */ }
}
