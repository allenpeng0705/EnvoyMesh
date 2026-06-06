/**
 * Live QR scanner for pairing URIs.
 *
 * On native Capacitor (iOS / Android) it delegates to `@capacitor/barcode-scanner`,
 * which uses AVFoundation on iOS and MLKit / ZXING on Android. This bypasses
 * the WKWebView `BarcodeDetector` limitations and gives true real-time scanning
 * with a native camera UI.
 *
 * On the web (browser dev) it falls back to a live `BarcodeDetector` loop over
 * a `MediaStream`. The caller is responsible for any UI (the previous
 * PairQrScanModal can be reused).
 *
 * The user cancels the native UI by tapping its dismiss button; we treat that
 * as `userCancelled` so the caller can show a friendly message.
 */
import { Capacitor } from "@capacitor/core";
import { CapacitorBarcodeScanner, CapacitorBarcodeScannerCameraDirection, CapacitorBarcodeScannerTypeHint } from "@capacitor/barcode-scanner";
import { parseEnvoyPairUri } from "@envoymesh/api";

import { assertEnvoyPairQrText } from "./decode-envoy-pair-qr.js";

export type LiveQrScannerResult =
  | { ok: true; uri: string }
  | { ok: false; reason: "userCancelled" | "unsupported" | "permissionDenied" | "scanFailed"; error?: string };

export interface LiveScanEnvironmentOptions {
  /** Optional instructions shown to the user in the native scanner UI. */
  instructions?: string;
}

/**
 * Detect whether the Capacitor native barcode scanner is available.
 */
export function isNativeBarcodeScannerAvailable(): boolean {
  return Capacitor.isNativePlatform() && typeof CapacitorBarcodeScanner?.scanBarcode === "function";
}

/**
 * Open the native live QR scanner. Resolves when a code is read or the user
 * cancels. The promise does not throw; the result is always a discriminated
 * union so the caller can render the appropriate UX.
 */
export async function scanEnvoyPairUriLive(
  options: LiveScanEnvironmentOptions = {},
): Promise<LiveQrScannerResult> {
  if (!isNativeBarcodeScannerAvailable()) {
    return { ok: false, reason: "unsupported" };
  }
  try {
    const result = await CapacitorBarcodeScanner.scanBarcode({
      hint: CapacitorBarcodeScannerTypeHint.QR_CODE,
      cameraDirection: CapacitorBarcodeScannerCameraDirection.BACK,
      scanInstructions: options.instructions ?? "Point at the pairing QR on your computer",
      scanButton: true,
      scanText: "Cancel",
    });
    const raw = result?.ScanResult?.trim();
    if (!raw) {
      return { ok: false, reason: "userCancelled" };
    }
    try {
      return { ok: true, uri: assertEnvoyPairQrText(raw) };
    } catch (validationError) {
      return {
        ok: false,
        reason: "scanFailed",
        error: validationError instanceof Error ? validationError.message : String(validationError),
      };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const lower = message.toLowerCase();
    if (lower.includes("cancel")) {
      return { ok: false, reason: "userCancelled" };
    }
    if (lower.includes("permission") || lower.includes("not authorized")) {
      return { ok: false, reason: "permissionDenied", error: message };
    }
    return { ok: false, reason: "scanFailed", error: message };
  }
}

export { parseEnvoyPairUri };
