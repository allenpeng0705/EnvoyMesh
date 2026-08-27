/**
 * @envoymesh/envoy-harness-adapter — the reference MAP adapter.
 *
 * **What this package is:** the bridge between envoy-harness
 * (Package 1, mesh-agnostic) and EnvoyMesh's mesh (Package 2
 * protocol + Package "agent-adapter" interface). Implements
 * `AgentAdapter` from `@envoymesh/agent-adapter`.
 *
 * **What this package is NOT:**
 * - Not a fork of envoy-harness. The adapter depends on the
 *   package; the package does NOT depend on the adapter.
 *   (One-way dependency: adapter → harness.)
 * - Not a generic EnvoyMesh library. The adapter is specific
 *   to envoy-harness as the runtime.
 *
 * **Design doc:** `docs/improving-agent-network.en.md` §5.2
 * (in the EnvoyMesh monorepo). Reference implementations:
 * `OpenClawAdapter`, `PiAdapter` in
 * `packages/agent-adapter/src/`.
 *
 * **Stability:** the public surface is `EnvoyHarnessAdapter`
 * (class), `ENVOY_HARNESS_SKILLS`, and the per-adapter
 * helpers. Additive; new fields don't break existing callers.
 */
export declare const ENVOY_HARNESS_ADAPTER_VERSION: "0.0.0";
export { ENVOY_HARNESS_SKILLS, ENVOY_HARNESS_VERSION, getToolsForSkill, isReadOnlySkill, type EnvoyHarnessSkillId, type EnvoyHarnessToolName, } from "./skills.js";
export { TOOL_CALL_SCHEMA_REF, TOOL_RESULT_SCHEMA_REF, localToWireBlock, localToWireContent, localToWireMetrics, localToWireResult, type ToolCallData, type ToolResultData, } from "./translation.js";
export { EnvoyHarnessAdapter, defaultBuildAgentFactory, buildEnvoyHarnessAdapterWithCrossVerify, type BuildAgentFn, type BuildEnvoyHarnessAdapterWithCrossVerifyInput, type EnvoyHarnessAdapterInput, type SignResultFn, } from "./adapter.js";
export { defaultSignResult, defaultSignResultFromKeyPair, } from "./signing.js";
export { defaultCrossVerify, runLocalVerifier, runLocalVerifierOnLocal, type CrossVerifyFn, } from "./verify.js";
export { RemoteMeshSubmitter, type RemoteMeshSubmitterOptions, type RemoteSubmitterTransport, } from "./remote-mesh-submitter.js";
export { createPeerRemoteSubmitterTransport, } from "./peer-transport.js";
export { LocalCrossRuntimeSubmitter, type LocalCrossRuntimeSubmitterOptions, type LocalRuntimeBridge, } from "./local-cross-runtime-submitter.js";
export type { MeshSubmitter, SubagentInput, SubagentResult, SubagentRecord, RoutingHint, SubagentResultSigner, AgentRuntime, } from "@envoymesh/envoy-harness";
export { listPeersBridge, listPeersTool, relayStatusBridge, buildRelayStatusTool, runSponsorFriendBridge, sponsorFriendTool, __resetActiveSponsorLoopsForTests, type BClassPeerListDeps, type PeerListResult, type PeerListEntry, type BClassRelayStatusDeps, type BClassRelayStatusResult, type BClassRelaySnapshot, type BClassAuditEventLike, type BClassSponsorFriendDeps, type BClassSponsorFriendMeshDeps, type BClassSponsorFriendProfileDeps, type BClassSponsorFriendConfigDeps, type BClassSponsorFriendAuditDeps, type BClassPersistedNodeConfig, type BClassHelloProfile, type BClassResolvedSponsorFriend, type BClassSponsorFriendResult, } from "./b-class-skills/index.js";
export { createMeshCredentialsProvider, type MeshCredentialsTransport, } from "./mesh-credentials.js";
export { loadRemoteSession, type RemoteSessionProjection, type RemoteSessionRef, type RemoteSessionTransport, } from "./remote-session.js";
//# sourceMappingURL=index.d.ts.map