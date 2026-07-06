/**
 * Cross-platform geolocation adapter.
 *
 * The shared Social UI must not statically import `@capacitor/geolocation` —
 * that package only resolves inside the Capacitor native shell and would
 * break the web/Tauri build. Instead we:
 *
 *   1. Detect the Capacitor native runtime via `window.Capacitor`.
 *   2. On native: dynamically `import("@capacitor/geolocation")` (kept out of
 *      the web bundle by the dynamic import) and call its plugin API.
 *   3. On web/Tauri: fall back to the standard `navigator.geolocation`.
 *
 * This keeps a single code path in SetupView/SearchView while letting the
 * mobile build use the reliable native permission + geolocation path
 * (iOS WKWebView's raw geolocation prompt is notoriously flaky).
 */

export interface AdapterPosition {
  latitude: number;
  longitude: number;
  accuracy?: number;
}

export interface AdapterPositionOptions {
  timeoutMs?: number;
  maximumAgeMs?: number;
}

function hasCapacitorNative(): boolean {
  if (typeof window === "undefined") return false;
  // Capacitor injects a global `Capacitor` object; `isNativePlatform()`
  // distinguishes iOS/Android from web. We read it defensively to avoid a
  // static dep on @capacitor/core in the web build.
  const cap = (window as Window & { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return Boolean(cap?.isNativePlatform?.());
}

/**
 * Resolve the current device position. Throws on denial/timeout so callers
 * can fall back to locale-based country detection.
 */
export async function getCurrentPosition(
  opts: AdapterPositionOptions = {},
): Promise<AdapterPosition> {
  const timeout = opts.timeoutMs ?? 12_000;
  const maximumAge = opts.maximumAgeMs ?? 600_000;

  if (hasCapacitorNative()) {
    try {
      // This dynamic import is the runtime entry point for the native
      // geolocation plugin. The `@capacitor/geolocation` package is only
      // installed in apps/mobile; on web/Tauri it isn't on disk, so both
      // Vite's dev server and the production build are configured to treat
      // it as external (see vite.config.ts → externalizeCapacitorGeolocation).
      // The `isNativePlatform()` guard above ensures this import is only
      // evaluated inside the native shell where the package resolves.
      const { Geolocation } = await import(/* @vite-ignore */ "@capacitor/geolocation");
      const pos = await Geolocation.getCurrentPosition({
        timeout,
        maximumAge,
        enableHighAccuracy: false,
      });
      return {
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
      };
    } catch (error) {
      // Plugin not installed / permission denied — fall through to web API
      // so the user at least gets the standard prompt on platforms where it
      // works.
      if (!("geolocation" in navigator)) throw error;
    }
  }

  // Web / Tauri / plugin-fallback path.
  if (!("geolocation" in navigator)) {
    throw new Error("geolocation-unavailable");
  }
  return new Promise<AdapterPosition>((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        }),
      (err) => reject(err),
      { timeout, maximumAge, enableHighAccuracy: false },
    );
  });
}
