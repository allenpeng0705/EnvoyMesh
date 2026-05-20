/**
 * Persists published-library manifest under Capacitor Directory.Data (FS-D parity with desktop).
 */
const REL_PATH = "envoymesh_profile/published-library.json";

function _uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

function _base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export async function loadMobilePublishedDocumentIds(): Promise<Set<string>> {
  try {
    const { Filesystem, Directory } = await import("@capacitor/filesystem");
    const result = await Filesystem.readFile({
      path: REL_PATH,
      directory: Directory.Data,
    });
    const text = new TextDecoder().decode(_base64ToUint8Array(result.data as string));
    const j = JSON.parse(text) as { documentIds?: string[] };
    return new Set(j.documentIds ?? []);
  } catch {
    return new Set();
  }
}

export async function saveMobilePublishedDocumentIds(ids: Set<string>): Promise<void> {
  const { Filesystem, Directory } = await import("@capacitor/filesystem");
  const body = `${JSON.stringify({ documentIds: [...ids].sort() }, null, 2)}\n`;
  const data = _uint8ArrayToBase64(new TextEncoder().encode(body));
  await Filesystem.writeFile({
    path: REL_PATH,
    data,
    directory: Directory.Data,
  });
}
