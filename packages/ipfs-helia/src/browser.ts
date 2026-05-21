/**
 * Browser / Capacitor entry — no Node built-ins.
 * Vite mobile build injects __ENVOYMESH_HELIA_VERSION__ at compile time.
 */
import {
  HELIA_UNIXFS_EXPORT_ADD_OPTIONS_V1,
  HELIA_UNIXFS_EXPORT_RECIPE_V1_ID,
  heliaUnixfsAddBytesInteropRecipeV1,
  heliaUnixfsExportRecipeV1Description,
  type HeliaIpfsExportAddOutcome,
} from "./helia-ipfs-export-core.js";

declare const __ENVOYMESH_HELIA_VERSION__: string | undefined;

let _browserHeliaVersion: string | undefined;

export function readHeliaPackageVersionSync(): string {
  if (_browserHeliaVersion) return _browserHeliaVersion;
  if (typeof __ENVOYMESH_HELIA_VERSION__ === "string" && __ENVOYMESH_HELIA_VERSION__.trim()) {
    _browserHeliaVersion = __ENVOYMESH_HELIA_VERSION__.trim();
    return _browserHeliaVersion;
  }
  return "unknown";
}

export async function heliaUnixfsAddBytesInteropRecipeV1Browser(
  bytes: Uint8Array,
): Promise<HeliaIpfsExportAddOutcome> {
  return heliaUnixfsAddBytesInteropRecipeV1(bytes, readHeliaPackageVersionSync());
}

export {
  HELIA_UNIXFS_EXPORT_RECIPE_V1_ID,
  HELIA_UNIXFS_EXPORT_ADD_OPTIONS_V1,
  heliaUnixfsExportRecipeV1Description,
  type HeliaIpfsExportAddOutcome,
};
