/**
 * Browser-safe Helia UnixFS export (no Node built-ins).
 */
import { unixfs } from "@helia/unixfs";
import { MemoryBlockstore } from "blockstore-core/memory";
import { fixedSize } from "ipfs-unixfs-importer/chunker";
import { balanced } from "ipfs-unixfs-importer/layout";

/** EnvoyMesh manifest / audit — bump only when UnixFS import options below change semantics. */
export const HELIA_UNIXFS_EXPORT_RECIPE_V1_ID = "helia-unixfs-export-v1";

/**
 * Target Kubo `ipfs add --cid-version 1` parity (H3 golden CI validates).
 */
export const HELIA_UNIXFS_EXPORT_ADD_OPTIONS_V1 = {
  cidVersion: 1 as const,
  rawLeaves: true,
  reduceSingleLeafToSelf: true,
  chunker: fixedSize({ chunkSize: 262_144 }),
  layout: balanced({ maxChildrenPerNode: 174 }),
  shardSplitStrategy: "links-bytes" as const,
};

export function heliaUnixfsExportRecipeV1Description(): string {
  return "helia unixfs addBytes cidVersion=1 rawLeaves=true chunkSize=262144 fanout=174";
}

export interface HeliaIpfsExportAddOutcome {
  ok: boolean;
  cid?: string;
  heliaVersion: string;
  stderr?: string;
  errorHint?: string;
}

export async function heliaUnixfsAddBytesInteropRecipeV1(
  bytes: Uint8Array,
  heliaVersion: string,
): Promise<HeliaIpfsExportAddOutcome> {
  try {
    const blockstore = new MemoryBlockstore();
    const fs = unixfs({ blockstore });
    const cid = await fs.addBytes(bytes, HELIA_UNIXFS_EXPORT_ADD_OPTIONS_V1);

    return {
      ok: true,
      cid: cid.toString(),
      heliaVersion,
    };
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
