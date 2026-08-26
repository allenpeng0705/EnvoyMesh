/**
 * @envoymesh/envoy-harness-peer — standalone peer collaboration.
 *
 * D2: JSON-RPC transport + `PeerClient` + `PeerMeshSubmitter` over the
 * harness's shared framing. Grows into the full MAP-over-JSON-RPC server
 * (D3) per `docs/distributed-collaboration.md`.
 */
export { PeerClient, type PeerClientOptions, } from "./client.js";
export { PeerMeshSubmitter, type PeerMeshSubmitterOptions, } from "./submitter.js";
export { createPeerServerHandler, type PeerServerOptions, } from "./server.js";
export { PeerRegistry, type PeerEntry, } from "./registry.js";
export { createPeerTeamExecutor, type PeerTeamExecutorOptions, } from "./team.js";
export { createCrossInstanceVerifier, type CrossInstanceVerifier, type CrossVerifyOutcome, type CrossVerifyRequest, } from "./verify.js";
export { PeerScoreboard, combinePeerVerdicts, type PeerReputation, } from "./scoreboard.js";
export { createVerifiedScoreKeeper, type VerifyAndRecordRequest, } from "./verify-score.js";
export { signedResultToSubagentResult, subagentInputToExecuteInput, } from "./mapping.js";
export { createInProcessPeerPair, type InProcessPeerPair, } from "./pair.js";
export { PEER_PING_METHOD, PEER_VERIFY_METHOD, PEER_MANIFEST_METHOD, PEER_SUBMIT_METHOD, type PeerPingResult, type PeerSubmitResponse, } from "./messages.js";
export { wrapEnvelope, unwrapEnvelope, canonicalPeerPayload, type PeerEnvelope, type PeerSigner, type PeerVerifier, } from "./envelope.js";
export type { PeerEvent, PeerEventSink } from "./events.js";
export { connectPeerClient, type TcpPeerClient, type TcpPeerClientOptions, } from "./tcp.js";
export { connectPeerClients, createPeerClusterSubmitter, type ConnectPeerClientsResult, type PeerClusterSubmitterOptions, type PeerEndpointConfig, } from "./cluster.js";
export { ManagedPeerCluster, type ConnectPeerResult, type ManagedPeerClusterOptions, } from "./managed-cluster.js";
export { parseServeArgs, startPeerServer, createDemoAdapter, loadAdapterFromFile, runPeerServeCli, PEER_SERVE_HELP, type PeerServeArgs, type PeerServeIo, type StartedPeerServer, } from "./cli/serve.js";
export { createPeersTool, type PeersToolOptions } from "./tools/peers-tool.js";
export { createPeerPoolStatusBackend, clusterStatusFromConnect, type ConnectResultLike, type PeerHealthInfo, peerToInfo, } from "./status.js";
export { aggregateScoreboard, aggregateVerdicts, buildHealthProvider, createPeerUiBackend, parsePeerUiArgs, runPeerUiCli, PEER_UI_HELP, type PeerUiArgs, type PeerUiBackend, type PeerUiBackendOptions, type PeerUiIo, type PeerUiPeerArg, } from "./cli/ui.js";
//# sourceMappingURL=index.d.ts.map