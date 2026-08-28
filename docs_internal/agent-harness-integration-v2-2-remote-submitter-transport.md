# envoy-harness integration — v2.2 sub-plan (cross-node RemoteSubmitterTransport)

> **Status:** ✅ IMPLEMENTED (2026-08-22). The seam is shipped AND the
> mesh fabric transport is implemented in EnvoyMesh. This doc records
> the contract the implementation landed against.
>
> **D6 update (2026-08-22):** the `RemoteSubmitterTransport` seam is now
> proven with a **second implementation** — `createPeerRemoteSubmitterTransport`
> (from `@envoymesh/envoy-harness-adapter`), which routes a mesh node's
> `RemoteMeshSubmitter` to a standalone envoy-harness peer cluster over
> MAP-over-JSON-RPC. A mesh node can already treat a peer cluster as its
> execution pool (Pattern A of `distributed-collaboration.md`). The v2.2
> libp2p fabric plugs into the SAME seam — swap the transport, keep the
> submitter.
>
> **Round 3 update (2026-08-22):** standalone verification now federates
> into the mesh arbitration store (`federatePeerScoreboard`), so peer-cluster
> verdicts feed the mesh reputation ledger.
>
> **v2.2 implementation (2026-08-22):** the libp2p fabric transport is now
> implemented (see §2). `createLibp2pRemoteSubmitterTransport` (apps/node)
> plugs into the SAME `RemoteSubmitterTransport` seam as the peer
> implementation; the worker side is a new `task.harness.submit.request`
> intent handled by `NodeServiceImpl.handleInboundHarnessSubmitRequest`.

## 1. What ships today

`RemoteMeshSubmitter` (envoy-harness-adapter) is a thin wrapper
over the host-injected `RemoteSubmitterTransport`:

```ts
export interface RemoteSubmitterTransport {
  send(
    input: SubagentInput,
    targetPeerId: string,
    signal: AbortSignal,
  ): Promise<SubagentResult>;
}
```

The submitter rejects unsigned results and forwards the parent's
abort signal; everything else (crypto, wire format, routing) is
the transport's job. There is **no default transport** — the
host (EnvoyMesh fabric) provides one.

## 2. What v2.2 implements

`createLibp2pRemoteSubmitterTransport` (EnvoyMesh `apps/node/src/
harness-submit-transport.ts`) — a `RemoteSubmitterTransport` that:

1. **Signs the request** with the parent's agent key
   (`signUnsignedEnvelope` / `@envoymesh/identity`).
2. **Sends** the serialized `ExecuteInput` (mapped from `SubagentInput`)
   to the target peer over the mesh's existing expect-reply seam
   (`sendExpectReplyWithRetry`, same-stream — the same pattern as
   `probeChainWorkerReady`).
3. **Receives** the worker's reply envelope containing the signed
   `AgentResult`.
4. **Verifies** the reply envelope's signature with the worker's public
   key (`verifyInboundEnvelope`, TOFU — the same trust contract as the
   chain ready probe) AND that the reply's `senderPeerId` is the worker
   it asked (a forged/relayed envelope cannot impersonate the worker).
   The inner `SignedAgentResult.signature` (owner key) is verified later
   by the verifier / arbitration path, exactly like the chain-worker MAP
   path.
5. **Honors the abort signal** — a parent abort rejects the round-trip
   with an `AbortError` immediately (the in-flight expect-reply has no
   cancel channel; the caller stops waiting).

**Worker side** (`apps/node/src/harness-submit-inbound.ts`, wired via
`NodeServiceImpl.handleInboundHarnessSubmitRequest` + the mesh inbound
dispatcher):

- `task.harness.submit.request` — parent agent → worker agent. Payload is
  the serializable half of `ExecuteInput` (no AbortSignal; the worker
  rebuilds one from `deadlineMs`).
- The worker runs it through its live `EnvoyHarnessAdapter.execute()`
  and replies `task.harness.submit.response` with the signed
  `AgentResult` — or a wire error (`ok: false`) when the adapter is
  unavailable or execution fails, so the parent fails fast instead of
  waiting out the deadline.

**Protocol** (`@envoymesh/protocol`): `TaskHarnessSubmitRequestPayloadSchema`
+ `TaskHarnessSubmitResponsePayloadSchema` (discriminated `ok` union),
the two intents in the `EnvoyIntentSchema` allowlist, and an
`AGENT_AGENT_ONLY` role policy entry.

**Self-submit:** when the target resolves to the node's own agent peer,
the transport executes through the node's own adapter (`executeLocally`)
instead of a mesh loopback.

**Access:** `NodeServiceImpl.createLibp2pRemoteSubmitterTransport()`
builds the transport over the same `ChainTransportResolver` the chain
workers use (mesh + peer-directory + identity), returning `null` when
the mesh or agent identity is unavailable.

## 3. Contract requirements

- The returned `SubagentResult.signature` MUST be non-empty
  (the submitter rejects empty signatures).
- The transport MUST throw (not return a fake result) when
  signature verification fails.
- The transport MUST reject a reply whose `senderPeerId` is not the
  requested worker peer (impersonation guard).
- The transport MUST forward `signal` — a parent abort cancels
  the round-trip.
- The transport owns all key material (parent private key +
  worker public key); the submitter stays key-agnostic.

## 4. What remains (deferred)

- **Routing/UX wiring:** nothing consumes the transport yet — a mesh
  node can build it via `createLibp2pRemoteSubmitterTransport()` and
  pass it to a `RemoteMeshSubmitter`, but choosing between the peer
  cluster (Pattern A) and direct mesh peers (Pattern B) per submit is
  EnvoyMesh product work.
- **Owner-key result verification inside the transport:** v1 verifies
  the reply envelope (worker agent key, TOFU). Verifying the inner
  `SignedAgentResult.signature` against the worker's owner public key
  from the manifest/peerstore is a hardening follow-up (the chain
  arbitration path already does this for chain results).
- **Expect-reply cancellation:** a parent abort stops the caller from
  waiting but does not cancel the in-flight request delivery — same
  limitation as the existing chain ready probe.
