import { parseEnvoyPairUri } from "@envoymesh/api";

declare global {
  interface BarcodeDetector {
    detect(source: ImageBitmapSource): Promise<Array<{ rawValue?: string }>>;
  }
  // eslint-disable-next-line no-var
  var BarcodeDetector: {
    new (options?: { formats?: string[] }): BarcodeDetector;
  } | undefined;
}

export function assertEnvoyPairQrText(raw: string): string {
  const value = raw.trim();
  if (!value) {
    throw new Error("Empty QR code");
  }
  parseEnvoyPairUri(value);
  return value;
}

export async function decodeQrTextFromImageSource(source: ImageBitmapSource): Promise<string> {
  if (typeof globalThis.BarcodeDetector === "undefined") {
    throw new Error(
      "QR scanning is not supported on this device. Paste the pairing link from desktop Settings → Node.",
    );
  }
  const detector = new globalThis.BarcodeDetector({ formats: ["qr_code"] });
  const codes = await detector.detect(source);
  const match =
    codes.find((code) => code.rawValue?.includes("envoy://pair") || code.rawValue?.includes("wsUrl=")) ??
    codes[0];
  const value = match?.rawValue?.trim();
  if (!value) {
    throw new Error("No QR code found in that image — try again or paste the link.");
  }
  return assertEnvoyPairQrText(value);
}

export async function decodeEnvoyPairUriFromFile(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  try {
    return await decodeQrTextFromImageSource(bitmap);
  } finally {
    bitmap.close();
  }
}
