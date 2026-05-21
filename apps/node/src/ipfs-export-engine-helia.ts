import {
  HELIA_UNIXFS_EXPORT_RECIPE_V1_ID,
  ensureHeliaIpfsReady,
  getHeliaIpfsEngineStatus,
  heliaUnixfsAddFileInteropRecipeV1,
} from "@envoymesh/ipfs-helia";
import type { IpfsExportAddOutcome, IpfsExportEngine } from "./ipfs-export-engine.js";

export const heliaExportEngine: IpfsExportEngine = {
  id: "helia",

  availableSync(_profileDir: string): boolean {
    return getHeliaIpfsEngineStatus(_profileDir).available;
  },

  getStatus(profileDir: string) {
    const status = getHeliaIpfsEngineStatus(profileDir);
    return {
      available: status.available,
      running: status.running,
      managed: status.managed,
      engineVersion: status.heliaVersion,
      errorHint: status.errorHint,
    };
  },

  async ensureReady(profileDir: string): Promise<void> {
    await ensureHeliaIpfsReady({ profileDir });
  },

  async addFile(absFilePath: string, profileDir: string): Promise<IpfsExportAddOutcome> {
    await ensureHeliaIpfsReady({ profileDir });
    const outcome = await heliaUnixfsAddFileInteropRecipeV1(absFilePath);
    return {
      ok: outcome.ok,
      cid: outcome.cid,
      engineId: "helia",
      engineVersion: outcome.heliaVersion,
      ipfsInteropRecipe: HELIA_UNIXFS_EXPORT_RECIPE_V1_ID,
      stderr: outcome.stderr,
      errorHint: outcome.errorHint,
    };
  },
};
