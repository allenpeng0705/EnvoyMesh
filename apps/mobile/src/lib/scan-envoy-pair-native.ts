/**
 * Live QR scan for `envoy://pair` URIs.
 *
 * On iOS, uses our own `EnvoyQrScanner` local Pod (apps/mobile/ios/App/Plugins/EnvoyQrScanner),
 * a small AVFoundation-based scanner. We don't use the community barcode plugin
 * on iOS because its Swift implementation still relies on deprecated UIKit
 * APIs (`UIApplication.shared.windows`) and silently no-ops on first launch
 * before camera permission is granted.
 *
 * On Android, uses the community `@capacitor-community/barcode-scanner`
 * plugin (ZXing) for live scanning.
 *
 * In a plain browser (dev / Tauri / Electron), falls back to a Web
 * `BarcodeDetector` loop.
 *
 * Returns the scanned URI; throws on cancellation, camera permission denial,
 * or non-`envoy://pair` content.
 */
import { Capacitor } from "@capacitor/core";
import { registerPlugin } from "@capacitor/core";

import { assertEnvoyPairQrText, decodeQrTextFromImageSource } from "./decode-envoy-pair-qr.js";

export interface NativeScanOptions {
  /** Force the Web fallback even on a native platform (used in browser dev). */
  forceWeb?: boolean;
}

interface EnvoyQrScannerPlugin {
  startScan(options?: { cameraDirection?: "back" | "front" }): Promise<{
    hasContent: boolean;
    content?: string;
  }>;
  stopScan(): Promise<void>;
  checkPermission(): Promise<
    { granted?: boolean; denied?: boolean; restricted?: boolean; neverAsked?: boolean; unknown?: boolean }
  >;
}

const EnvoyQrScanner = registerPlugin<EnvoyQrScannerPlugin>("EnvoyQrScanner");

const isCapacitorNative = (): boolean =>
  Capacitor?.isNativePlatform?.() === true &&
  (Capacitor.getPlatform?.() === "ios" || Capacitor.getPlatform?.() === "android");

const isCancelledOrDenied = (msg: string): boolean =>
  /cancel(?:ed|led)|denied|permission/i.test(msg);

const userDenied = (err: unknown): boolean => {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: string; message?: string };
  if (e.code === "permissionDenied") return true;
  return isCancelledOrDenied(e.message ?? "");
};

export async function scanEnvoyPairUriNative(options: NativeScanOptions = {}): Promise<string> {
  if (options.forceWeb !== true && isCapacitorNative()) {
    const platform = Capacitor.getPlatform();

    // iOS — our own AVFoundation-based plugin.
    if (platform === "ios") {
      try {
        const perm = await EnvoyQrScanner.checkPermission();
        if (perm?.denied || perm?.restricted) {
          throw new Error(
            "Camera access is blocked. Enable Camera in Settings → EnvoyMesh, then try again.",
          );
        }
        const result = await EnvoyQrScanner.startScan({ cameraDirection: "back" });
        if (!result?.hasContent || !result.content) {
          throw new Error("Scanning was cancelled before a code was detected.");
        }
        try {
          return assertEnvoyPairQrText(result.content);
        } catch (validationError) {
          // Surface what we actually scanned so the user can tell whether they
          // scanned a wrong/stale QR vs. a partial capture.
          const preview = result.content.length > 80
            ? `${result.content.slice(0, 80)}…`
            : result.content;
          const reason = validationError instanceof Error
            ? validationError.message
            : String(validationError);
          throw new Error(
            `QR doesn't look like an envoy://pair link (${reason}). Scanned: ${preview}`,
          );
        }
      } catch (err) {
        if (userDenied(err)) {
          throw new Error("Camera scanning was cancelled or denied. Paste the link instead.");
        }
        throw err;
      } finally {
        try {
          await EnvoyQrScanner.stopScan();
        } catch {
          /* ignore — best effort */
        }
      }
    }

    // Android — community barcode scanner (ZXing).
    const mod = await import("@capacitor-community/barcode-scanner");
    const BarcodeScanner = mod.BarcodeScanner;
    const SupportedFormat = mod.SupportedFormat;
    try {
      const perm = await BarcodeScanner.checkPermission({ force: true });
      if (perm?.denied || perm?.restricted || perm?.unknown) {
        throw new Error(
          "Camera access is blocked. Enable Camera in Settings → EnvoyMesh, then try again.",
        );
      }
    } catch (err) {
      if (err instanceof Error) throw err;
      throw new Error(String(err));
    }
    try {
      const result = await BarcodeScanner.startScan({
        targetedFormats: [SupportedFormat.QR_CODE],
        cameraDirection: mod.CameraDirection?.BACK,
      });
      if (!result?.hasContent || !result.content) {
        throw new Error("Scanning was cancelled before a code was detected.");
      }
      return assertEnvoyPairQrText(result.content);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (isCancelledOrDenied(msg)) {
        throw new Error("Camera scanning was cancelled or denied. Paste the link instead.");
      }
      throw err;
    } finally {
      try {
        await BarcodeScanner.stopScan({ resolveScan: false });
      } catch {
        /* ignore — best effort */
      }
      try {
        await BarcodeScanner.showBackground();
      } catch {
        /* ignore */
      }
    }
  }

  // Web fallback — live <video> + BarcodeDetector.
  if (typeof globalThis.BarcodeDetector === "undefined") {
    throw new Error(
      "Live QR scanning is not supported in this browser. Paste the pairing link from desktop Settings → Node.",
    );
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: "environment" } },
    audio: false,
  });

  const video = document.createElement("video");
  video.srcObject = stream;
  video.playsInline = true;
  video.muted = true;

  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => {
        void video.play().then(resolve).catch(reject);
      };
      video.onerror = () => reject(new Error("Camera preview failed"));
    });
  } catch (err) {
    stream.getTracks().forEach((track) => track.stop());
    throw err instanceof Error ? err.message : String(err);
  }

  try {
    const detector = new globalThis.BarcodeDetector({ formats: ["qr_code"] });
    const startedAt = Date.now();
    while (Date.now() - startedAt < 30_000) {
      try {
        return await decodeQrTextFromImageSource(video);
      } catch {
        /* not yet a match */
      }
      await new Promise((r) => setTimeout(r, 250));
    }
    throw new Error("No pairing QR detected — hold the code steady and try again.");
  } finally {
    stream.getTracks().forEach((track) => track.stop());
    video.srcObject = null;
  }
}
