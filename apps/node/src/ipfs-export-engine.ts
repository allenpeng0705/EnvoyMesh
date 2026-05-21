/**
 * Pluggable IPFS export engines (Kubo subprocess today; Helia in-process in H2+).
 * See docs/helia-ipfs-integration-plan.md.
 */

export type IpfsExportEngineId = "kubo" | "helia";

/** Owner-selectable export mode (Settings / node-config.json). */
export type IpfsExportEngineSelection = "kubo" | "helia" | "kubo-with-helia-shadow";

export interface IpfsExportAddOutcome {
  ok: boolean;
  cid?: string;
  engineId: IpfsExportEngineId;
  engineVersion: string;
  ipfsInteropRecipe: string;
  stderr?: string;
  errorHint?: string;
}

export interface IpfsEngineStatusSlice {
  available: boolean;
  running: boolean;
  managed: boolean;
  engineVersion?: string;
  errorHint?: string;
}

export interface IpfsExportEngine {
  readonly id: IpfsExportEngineId;
  availableSync(profileDir: string): boolean;
  getStatus(profileDir: string): IpfsEngineStatusSlice;
  ensureReady(profileDir: string): Promise<void>;
  addFile(absFilePath: string, profileDir: string): Promise<IpfsExportAddOutcome>;
}
