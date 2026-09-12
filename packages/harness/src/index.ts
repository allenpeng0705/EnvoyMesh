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
  defaultClaudeCodeModel,
  defaultHermesModel,
  defaultOpenHumanModel,
  hermesApiBase,
  hermesApiKey,
  hermesEnvCandidatePaths,
  homeDirCandidates,
  listHermesModels,
  listOpenHumanModels,
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
// Phase 55E — Hermes supervised autostart (default on;
// force off with ENVOYMESH_EXT_AGENT_AUTOSTART=0). OpenHuman uses
// OpenHuman.app only (HTTP backend; no headless spawn).
export {
  HermesSupervisedBackend,
  createHermesSupervisedBackend,
  type HermesSupervisedBackendOptions,
} from "./supervised-hermes-backend.js";
export {
  OpenHumanSupervisedBackend,
  createOpenHumanSupervisedBackend,
  type OpenHumanSupervisedBackendOptions,
} from "./supervised-openhuman-backend.js";
// Phase 56A — one-shot CLI backend base + Cursor CLI. Phase 56B
// (aider) and 56C (mmx) follow the same pattern.
export {
  OneShotCliBackend,
  type OneShotCliBackendOptions,
} from "./one-shot-cli-backend.js";
export {
  CursorAgentBackend,
  createCursorAgentBackend,
  type CursorAgentBackendOptions,
} from "./cursor-agent-backend.js";
export {
  AiderBackend,
  createAiderBackend,
  type AiderBackendOptions,
} from "./aider-backend.js";
export {
  MmxBackend,
  createMmxBackend,
  type MmxBackendOptions,
} from "./mmx-backend.js";
export {
  buildExtAgentCommandCatalog,
  formatExtAgentCommandHelp,
  mergeExtAgentCommandDescriptors,
  EXT_AGENT_COMMAND_CATALOG_VERSION,
} from "./command-catalog.js";
export { getCachedClaudeCodeSlashCommands } from "./claudecode-backend.js";
export {
  getExtAgentSessionModel,
  setExtAgentSessionModel,
  supportsExtAgentSessionModel,
  EXT_AGENT_SESSION_MODEL_AGENTS,
} from "./session-model-store.js";
export {
  getExtAgentProjectPathCwd,
  setExtAgentProjectPathInStore,
  syncExtAgentProjectPathsFromAgents,
} from "./project-path-store.js";
export {
  fetchOpenAiCompatibleModels,
  parseOpenAiModelsResponse,
} from "./model-list.js";
// Symbol-alias note: five modules expose a test-only `_test` namespace, so the
// barrel disambiguates them (`_backendTest`, `_supervisorTest`, `_claudeCodeTest`,
// `_hermesTest`, `_openHumanTest`). Same for the in-memory resets.
export { _resetExtAgentModelListCacheForTests } from "./model-list.js";
export { _resetExtAgentSessionModelsForTests } from "./session-model-store.js";
export { _test as _hermesTest } from "./supervised-hermes-backend.js";
export { _test as _openHumanTest } from "./supervised-openhuman-backend.js";
// Backends that are only reachable through `createBackend` today. Exported so
// the package's public surface covers every backend family uniformly.
export {
  ClaudeCodeBackend,
  createClaudeCodeBackend,
  _test as _claudeCodeTest,
} from "./claudecode-backend.js";
export {
  CodexBackend,
  createCodexBackend,
  type CodexBackendOptions,
} from "./codex-backend.js";
export {
  OpenCodeBackend,
  createOpenCodeBackend,
  type OpenCodeBackendOptions,
} from "./opencode-backend.js";
export {
  CodeWhaleBackend,
  createCodeWhaleBackend,
  type CodeWhaleBackendOptions,
} from "./codewhale-backend.js";
export {
  extractContentBlocks,
  extractOneShotAssistantText,
  type ExtractOneShotAssistantTextOptions,
  type OneShotJsonPrefer,
} from "./parse-one-shot-json.js";
export {
  augmentPathForExtAgentBins,
  commonExtAgentBinDirs,
  condaExtAgentBinDirs,
  ensureProcessPathHasExtAgentBins,
  isExtAgentBinaryAvailable,
  resolveExtAgentBinary,
  type CondaExtAgentBinDirsOptions,
} from "./resolve-ext-agent-binary.js";
