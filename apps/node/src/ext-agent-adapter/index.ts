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
  createPiBackend,
  setPiExtAgentAsk,
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
export {
  probeExtAgentReachability,
  extAgentStatusUrlFromMessageUrl,
  classifyExtAgentInstallState,
  defaultBinaryOnPath,
} from "./probe.js";
// Phase 55A — generic daemon supervisor for external processes.
// codex (55B) and (optionally) Hermes/OpenHuman (55E) consume this.
// ClaudeCode runs in-process via the SDK; Pi runs in-process; both
// skip the supervisor. The re-exports are intentionally narrow —
// callers should not reach into internals beyond the public API.
export {
  DaemonSupervisor,
  InstallMissingError,
  _test as _supervisorTest,
  type DaemonSupervisorOptions,
  type DaemonSupervisorRestartPolicy,
  type SupervisorEventMap,
  type SupervisorEventName,
  type SupervisorInstallMissingInfo,
  type SupervisorInstallMissingReason,
  type SupervisorStopInfo,
  type SupervisorCrashInfo,
  type SupervisorStuckInfo,
} from "./daemon-supervisor.js";
