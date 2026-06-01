import { useRef, useState } from "react";
import { useIsInProcessMobileNode } from "../../hooks/useNodeService.js";
import { useT } from "../../context/I18nContext.js";
import { QRCodeIcon } from "../../icons.js";

export function ContactLinkScanner({ onScan }: { onScan: (text: string) => void }) {
  const t = useT();
  const isMobile = useIsInProcessMobileNode();
  const inputRef = useRef<HTMLInputElement>(null);
  const [scanMsg, setScanMsg] = useState<string | null>(null);

  const decodeFromFile = async (file: File) => {
    setScanMsg(null);
    if (typeof BarcodeDetector === "undefined") {
      setScanMsg(t("discover.paste.scanUnsupported"));
      return;
    }
    try {
      const detector = new BarcodeDetector({ formats: ["qr_code"] });
      const bitmap = await createImageBitmap(file);
      const codes = await detector.detect(bitmap);
      bitmap.close();
      const value = codes[0]?.rawValue?.trim();
      if (!value) {
        setScanMsg(t("discover.paste.scanNotFound"));
        return;
      }
      onScan(value);
      setScanMsg(t("discover.paste.scanOk"));
    } catch {
      setScanMsg(t("discover.paste.scanFailed"));
    }
  };

  return (
    <div className="contact-link-scanner">
      <button type="button" className="discover-secondary-btn" onClick={() => inputRef.current?.click()}>
        <QRCodeIcon size={18} />
        {isMobile ? t("discover.paste.scanQr") : t("discover.paste.scanQrPhoto")}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture={isMobile ? "environment" : undefined}
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void decodeFromFile(file);
        }}
      />
      {scanMsg ? (
        <p className="discover-status discover-status--muted" role="status">
          {scanMsg}
        </p>
      ) : null}
    </div>
  );
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
