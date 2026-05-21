import type { ExternalPublishConfig, IpfsEngineStatus } from "@envoymesh/api";
import type {
  IpfsExportAddOutcome,
  IpfsExportEngine,
  IpfsExportEngineId,
  IpfsExportEngineSelection,
} from "./ipfs-export-engine.js";
import { heliaExportEngine } from "./ipfs-export-engine-helia.js";
import { kuboExportEngine } from "./ipfs-export-engine-kubo.js";

export const VALID_IPFS_EXPORT_ENGINE_SELECTIONS = [
  "kubo",
  "helia",
  "kubo-with-helia-shadow",
] as const satisfies readonly IpfsExportEngineSelection[];

const VALID_SELECTIONS = new Set<IpfsExportEngineSelection>(VALID_IPFS_EXPORT_ENGINE_SELECTIONS);

/** Coerce unknown config values to a safe engine selection (default kubo). */
export function normalizeIpfsExportEngineSelection(
  value: string | undefined,
): IpfsExportEngineSelection {
  if (value && VALID_SELECTIONS.has(value as IpfsExportEngineSelection)) {
    return value as IpfsExportEngineSelection;
  }
  return "kubo";
}

export function resolveIpfsExportEngineSelection(input?: {
  externalPublish?: Pick<ExternalPublishConfig, "ipfsExportEngine">;
}): IpfsExportEngineSelection {
  const env = process.env.ENVOYMESH_IPFS_EXPORT_ENGINE?.trim();
  if (env && VALID_SELECTIONS.has(env as IpfsExportEngineSelection)) {
    return env as IpfsExportEngineSelection;
  }
  return normalizeIpfsExportEngineSelection(input?.externalPublish?.ipfsExportEngine);
}

export function isHeliaShadowSelection(selection: IpfsExportEngineSelection): boolean {
  return selection === "kubo-with-helia-shadow";
}

/** Engine that produces `publishedExternal.cid` for the given selection. */
export function resolvePrimaryExportEngineId(selection: IpfsExportEngineSelection): IpfsExportEngineId {
  if (selection === "helia") return "helia";
  return "kubo";
}

export function getIpfsExportEngine(engineId: IpfsExportEngineId): IpfsExportEngine {
  if (engineId === "kubo") return kuboExportEngine;
  return heliaExportEngine;
}

export async function ensurePrimaryIpfsExportEngineReady(input: {
  profileDir: string;
  selection: IpfsExportEngineSelection;
}): Promise<void> {
  const engine = getIpfsExportEngine(resolvePrimaryExportEngineId(input.selection));
  await engine.ensureReady(input.profileDir);
}

export async function addFileViaPrimaryIpfsExportEngine(input: {
  absFilePath: string;
  profileDir: string;
  selection: IpfsExportEngineSelection;
}): Promise<IpfsExportAddOutcome> {
  const engine = getIpfsExportEngine(resolvePrimaryExportEngineId(input.selection));
  return engine.addFile(input.absFilePath, input.profileDir);
}

export async function addFileViaHeliaExportEngine(input: {
  absFilePath: string;
  profileDir: string;
}): Promise<IpfsExportAddOutcome> {
  return heliaExportEngine.addFile(input.absFilePath, input.profileDir);
}

function mapEngineSliceToHeliaApi(status: ReturnType<IpfsExportEngine["getStatus"]>) {
  return {
    available: status.available,
    heliaVersion: status.engineVersion,
    errorHint: status.errorHint,
  };
}

function mapEngineSliceToKuboApi(status: ReturnType<IpfsExportEngine["getStatus"]>) {
  return {
    available: status.available,
    kuboVersion: status.engineVersion,
    errorHint: status.errorHint,
  };
}

export function getIpfsEngineStatus(input: {
  profileDir: string;
  selection: IpfsExportEngineSelection;
}): IpfsEngineStatus {
  const kuboSlice = kuboExportEngine.getStatus(input.profileDir);
  const heliaSlice = heliaExportEngine.getStatus(input.profileDir);
  const heliaApi = mapEngineSliceToHeliaApi(heliaSlice);
  const kuboApi = mapEngineSliceToKuboApi(kuboSlice);
  const primaryId = resolvePrimaryExportEngineId(input.selection);

  if (primaryId === "helia") {
    return {
      available: heliaSlice.available,
      running: heliaSlice.running,
      managed: heliaSlice.managed,
      errorHint: heliaSlice.errorHint,
      helia: heliaApi,
      kubo: kuboApi,
    };
  }

  return {
    available: kuboSlice.available,
    running: kuboSlice.running,
    managed: kuboSlice.managed,
    kuboVersion: kuboSlice.engineVersion,
    errorHint: kuboSlice.errorHint,
    helia: heliaApi,
    kubo: kuboApi,
  };
}
