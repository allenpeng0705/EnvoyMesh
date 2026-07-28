export type { ExtAgentSidecarKind, ExtAgentInboundMessage } from "./types.js";
export { isExtAgentSidecarKind, EXT_AGENT_SIDECAR_KINDS } from "./types.js";
export {
  syncExtAgentSidecar,
  stopExtAgentSidecar,
  getRunningExtAgentSidecar,
  _resetExtAgentSidecarForTests,
  type SyncExtAgentSidecarParams,
} from "./manager.js";
export {
  createBackend,
  hermesApiBase,
  hermesApiKey,
  hermesEnvCandidatePaths,
  homeDirCandidates,
  openHumanRpcUrl,
  openHumanHttpBase,
  openHumanRpcToken,
  openHumanV1ApiKey,
  openHumanTransport,
  openHumanTokenCandidatePaths,
  openHumanWorkspaceCandidateDirs,
  openHumanEnvCandidatePaths,
  openHumanApiKeyFileCandidates,
  OPENHUMAN_EXTERNAL_V1_PROVIDER,
  _test as _backendTest,
} from "./backends.js";
export { startExtAgentHttpServer } from "./http-server.js";
