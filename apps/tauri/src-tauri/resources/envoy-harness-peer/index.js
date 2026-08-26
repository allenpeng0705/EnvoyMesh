/**
 * @envoymesh/envoy-harness-peer — standalone peer collaboration.
 *
 * D2: JSON-RPC transport + `PeerClient` + `PeerMeshSubmitter` over the
 * harness's shared framing. Grows into the full MAP-over-JSON-RPC server
 * (D3) per `docs/distributed-collaboration.md`.
 */
export { PeerClient, } from "./client.js";
export { PeerMeshSubmitter, } from "./submitter.js";
export { createPeerServerHandler, } from "./server.js";
export { PeerRegistry, } from "./registry.js";
export { createPeerTeamExecutor, } from "./team.js";
export { createCrossInstanceVerifier, } from "./verify.js";
export { PeerScoreboard, combinePeerVerdicts, } from "./scoreboard.js";
export { createVerifiedScoreKeeper, } from "./verify-score.js";
export { signedResultToSubagentResult, subagentInputToExecuteInput, } from "./mapping.js";
export { createInProcessPeerPair, } from "./pair.js";
export { PEER_PING_METHOD, PEER_VERIFY_METHOD, PEER_MANIFEST_METHOD, PEER_SUBMIT_METHOD, } from "./messages.js";
export { wrapEnvelope, unwrapEnvelope, canonicalPeerPayload, } from "./envelope.js";
export { connectPeerClient, } from "./tcp.js";
export { connectPeerClients, createPeerClusterSubmitter, } from "./cluster.js";
export { ManagedPeerCluster, } from "./managed-cluster.js";
export { parseServeArgs, startPeerServer, createDemoAdapter, loadAdapterFromFile, runPeerServeCli, PEER_SERVE_HELP, } from "./cli/serve.js";
export { createPeersTool } from "./tools/peers-tool.js";
export { createPeerPoolStatusBackend, clusterStatusFromConnect, peerToInfo, } from "./status.js";
export { aggregateScoreboard, aggregateVerdicts, buildHealthProvider, createPeerUiBackend, parsePeerUiArgs, runPeerUiCli, PEER_UI_HELP, } from "./cli/ui.js";
//# sourceMappingURL=index.js.map