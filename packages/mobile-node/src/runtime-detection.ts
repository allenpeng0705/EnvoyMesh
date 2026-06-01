/**
 * Runtime detection helpers for the in-process mobile node.
 *
 * The mobile app can run in two modes:
 * - Web (Vite dev server, browser): Capacitor plugin is unavailable; fall back
 *   to in-memory stores. Not secure for production keys.
 * - Native (Capacitor iOS/Android): Capacitor plugins are required; private
 *   keys must go to the platform secure storage (Keychain / EncryptedSharedPreferences).
 *
 * The secure-storage fallback to `localStorage` only applies on web; native
 * builds must fail closed if no secure storage is wired in.
 */
export function isCapacitorNative(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return cap?.isNativePlatform?.() === true;
}

export function isBrowserDevMode(): boolean {
  return !isCapacitorNative();
}
