import {
  IPFSInteropRecipeV1Id,
  kuboIpfsAddFileInteropRecipeV1,
  kuboIpfsCliAvailableSync,
} from "./kubo-ipfs-export.js";
import { ensureKuboIpfsReady, getKuboIpfsEngineStatus } from "./kubo-ipfs-engine.js";
import type { IpfsExportAddOutcome, IpfsExportEngine } from "./ipfs-export-engine.js";

export const kuboExportEngine: IpfsExportEngine = {
  id: "kubo",

  availableSync(profileDir: string): boolean {
    return kuboIpfsCliAvailableSync(profileDir);
  },

  getStatus(profileDir: string) {
    const status = getKuboIpfsEngineStatus(profileDir);
    return {
      available: status.available,
      running: status.running,
      managed: status.managed,
      engineVersion: status.kuboVersion,
      errorHint: status.errorHint,
    };
  },

  async ensureReady(profileDir: string): Promise<void> {
    await ensureKuboIpfsReady({ profileDir });
  },

  async addFile(absFilePath: string, profileDir: string): Promise<IpfsExportAddOutcome> {
    const outcome = kuboIpfsAddFileInteropRecipeV1(absFilePath, profileDir);
    return {
      ok: outcome.ok,
      cid: outcome.cid,
      engineId: "kubo",
      engineVersion: outcome.kuboVersion,
      ipfsInteropRecipe: IPFSInteropRecipeV1Id,
      stderr: outcome.stderr,
      errorHint: outcome.errorHint,
    };
  },
};
