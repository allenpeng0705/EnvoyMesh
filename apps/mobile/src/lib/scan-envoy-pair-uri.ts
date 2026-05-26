/**
 * Scan an `envoy://pair` QR code using the BarcodeDetector API when available.
 */
export async function scanEnvoyPairUri(): Promise<string> {
  if (typeof globalThis.BarcodeDetector === "undefined") {
    throw new Error(
      "QR scanning is not supported in this browser. Paste the pairing link from desktop Settings → Node.",
    );
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: "environment" },
    audio: false,
  });

  const video = document.createElement("video");
  video.srcObject = stream;
  video.playsInline = true;
  video.muted = true;

  await new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => {
      void video.play().then(resolve).catch(reject);
    };
    video.onerror = () => reject(new Error("Camera preview failed"));
  });

  const detector = new globalThis.BarcodeDetector({ formats: ["qr_code"] });
  const startedAt = Date.now();

  try {
    while (Date.now() - startedAt < 45_000) {
      const codes = await detector.detect(video);
      const match = codes.find((code) => code.rawValue?.includes("envoy://pair") || code.rawValue?.includes("wsUrl="));
      if (match?.rawValue) {
        return match.rawValue;
      }
      await new Promise((r) => setTimeout(r, 250));
    }
    throw new Error("No pairing QR detected — hold the code steady and try again.");
  } finally {
    stream.getTracks().forEach((track) => track.stop());
    video.srcObject = null;
  }
}

declare global {
  interface BarcodeDetector {
    detect(source: ImageBitmapSource): Promise<Array<{ rawValue?: string }>>;
  }
  // eslint-disable-next-line no-var
  var BarcodeDetector: {
    new (options?: { formats?: string[] }): BarcodeDetector;
  } | undefined;
}

export {};
