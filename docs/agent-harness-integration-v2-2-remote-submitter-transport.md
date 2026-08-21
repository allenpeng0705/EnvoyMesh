# envoy-harness integration — v2.2 sub-plan (cross-node RemoteSubmitterTransport)

> **Status:** PLANNED (2026-08-21). The seam is shipped; the
> fabric transport is deferred to EnvoyMesh. This doc records
> the contract so the implementation lands against a committed
> spec, not a guess.

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

A `Libp2pRemoteSubmitterTransport` in EnvoyMesh's
`apps/node/src/` that:

1. **Signs the request** with the parent's owner key
   (`@envoymesh/identity` `signCanonicalPayload`).
2. **Sends** the serialized `SubagentInput` to the target peer
   over the mesh (libp2p / the existing request/response
   envelope).
3. **Receives** the worker's signed `SubagentResult`.
4. **Verifies** the worker's signature with the worker's public
   key (from the manifest / peerstore) before returning.
5. **Honors the abort signal** — cancels the in-flight
   send/recv when the parent aborts.

## 3. Contract requirements

- The returned `SubagentResult.signature` MUST be non-empty
  (the submitter rejects empty signatures).
- The transport MUST throw (not return a fake result) when
  signature verification fails.
- The transport MUST forward `signal` — a parent abort cancels
  the round-trip.
- The transport owns all key material (parent private key +
  worker public key); the submitter stays key-agnostic.

## 4. Why deferred

The fabric (peer discovery, dial, envelopes, key store) is
EnvoyMesh's concern, not envoy-harness's. The seam is the
contract; the impl lands when the mesh's task-submission path
is ready. Until then, `LocalMeshSubmitter` / the
`LocalCrossRuntimeSubmitter` cover the same-process cases.
