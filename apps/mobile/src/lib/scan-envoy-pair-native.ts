/**
 * Live QR scan for `envoy://pair` URIs.
 *
 * On iOS and Android (Capacitor 6), uses the community `@capacitor-community/barcode-scanner`
 * plugin — Apple AVFoundation on iOS, ZXing on Android — for fast native live scanning.
 * In a plain browser (dev / Tauri / Electron), falls back to a Web `BarcodeDetector` loop.
 *
 * Returns the scanned URI; throws on cancellation, camera permission denial,
 * or non-`envoy://pair` content.
 */
import { Capacitor } from "@capacitor/core";

import { assertEnvoyPairQrText, decodeQrTextFromImageSource } from "./decode-envoy-pair-qr.js";

export interface NativeScanOptions {
  /** Force the Web fallback even on a native platform (used in browser dev). */
  forceWeb?: boolean;
}

const isCapacitorNative = (): boolean =>
  Capacitor?.isNativePlatform?.() === true &&
  (Capacitor.getPlatform?.() === "ios" || Capacitor.getPlatform?.() === "android");

const isCancelledOrDenied = (msg: string): boolean =>
  /cancel(?:ed|led)|denied|permission/i.test(msg);

export async function scanEnvoyPairUriNative(options: NativeScanOptions = {}): Promise<string> {
  if (options.forceWeb !== true && isCapacitorNative()) {
    const mod = await import("@capacitor-community/barcode-scanner");
    const BarcodeScanner = mod.BarcodeScanner;
    const SupportedFormat = mod.SupportedFormat;
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
        await BarcodeScanner.hideBackground();
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
