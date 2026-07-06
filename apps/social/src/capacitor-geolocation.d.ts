/**
 * Ambient declaration for the Capacitor Geolocation plugin.
 *
 * `@capacitor/geolocation` is declared as a dependency only in `apps/mobile`
 * (it ships native iOS/Android code). The shared Social UI uses it via a
 * dynamic `import("@capacitor/geolocation")` inside a Capacitor-runtime guard
 * (see `src/lib/geolocation-adapter.ts`), so the module is never resolved in
 * the web/Tauri build. This ambient shape lets TypeScript type-check that
 * dynamic import without forcing a workspace-wide dependency.
 *
 * The real types ship with `@capacitor/geolocation`; when present (mobile
 * build), they take precedence over this minimal shape.
 */
declare module "@capacitor/geolocation" {
  export interface GeolocationCoords {
    latitude: number;
    longitude: number;
    accuracy?: number;
    altitude?: number | null;
    altitudeAccuracy?: number | null;
    heading?: number | null;
    speed?: number | null;
  }
  export interface GeolocationPosition {
    coords: GeolocationCoords;
    timestamp: number;
  }
  export interface GeolocationPlugin {
    getCurrentPosition(options?: {
      enableHighAccuracy?: boolean;
      timeout?: number;
      maximumAge?: number;
    }): Promise<GeolocationPosition>;
    checkPermissions(): Promise<{ location: string; coarseLocation: string }>;
    requestPermissions(): Promise<{ location: string; coarseLocation: string }>;
  }
  export const Geolocation: GeolocationPlugin;
}
