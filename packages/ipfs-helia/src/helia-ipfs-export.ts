/**
 * Helia / UnixFS fingerprinting for EnvoyMesh (interop recipe v1).
 * Node entry — desktop node subprocess path.
 */
import {
  HELIA_UNIXFS_EXPORT_ADD_OPTIONS_V1,
  HELIA_UNIXFS_EXPORT_RECIPE_V1_ID,
  heliaUnixfsAddBytesInteropRecipeV1 as heliaUnixfsAddBytesCore,
  heliaUnixfsExportRecipeV1Description,
  type HeliaIpfsExportAddOutcome,
} from "./helia-ipfs-export-core.js";
import { readHeliaPackageVersionSync } from "./helia-version.js";

export {
  HELIA_UNIXFS_EXPORT_RECIPE_V1_ID,
  HELIA_UNIXFS_EXPORT_ADD_OPTIONS_V1,
  heliaUnixfsExportRecipeV1Description,
  readHeliaPackageVersionSync,
  type HeliaIpfsExportAddOutcome,
};

export async function heliaUnixfsAddBytesInteropRecipeV1(
  bytes: Uint8Array,
): Promise<HeliaIpfsExportAddOutcome> {
  return heliaUnixfsAddBytesCore(bytes, readHeliaPackageVersionSync());
}

/** Desktop / Node CLI — reads file from disk. Not used on mobile WebView. */
export async function heliaUnixfsAddFileInteropRecipeV1(
  absFilePath: string,
): Promise<HeliaIpfsExportAddOutcome> {
  const heliaVersion = readHeliaPackageVersionSync();
  try {
    const { readFile } = await import("node:fs/promises");
    const bytes = await readFile(absFilePath);
    return heliaUnixfsAddBytesCore(bytes, heliaVersion);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      heliaVersion,
      stderr: message,
      errorHint: `Helia UnixFS export failed: ${message}`,
    };
  }
}
