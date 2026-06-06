import { Capacitor } from "@capacitor/core";
import { Directory, Filesystem } from "@capacitor/filesystem";

function sanitizeOpenFilename(filename: string): string {
  const base = filename.split(/[/\\]/).pop()?.trim() || "file";
  return base.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120) || "file";
}

/**
 * Write bytes to Capacitor cache and open in the system viewer / browser.
 */
export async function openBase64FileInMobileViewer(params: {
  filename: string;
  contentBase64: string;
}): Promise<void> {
  const safeName = sanitizeOpenFilename(params.filename);
  const path = `envoy-open/${Date.now()}-${safeName}`;
  await Filesystem.writeFile({
    path,
    data: params.contentBase64,
    directory: Directory.Cache,
  });
  const { uri } = await Filesystem.getUri({ path, directory: Directory.Cache });
  if (Capacitor.isNativePlatform()) {
    const opened = window.open(uri, "_blank", "noopener,noreferrer");
    if (!opened) {
      window.location.assign(uri);
    }
    return;
  }
  window.open(uri, "_blank", "noopener,noreferrer");
}
