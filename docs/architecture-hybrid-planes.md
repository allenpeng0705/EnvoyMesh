# Hybrid Planes: Modular Discovery → Connection → Communication → Data

This document **separates concerns** into four workflows so **agentic logic** can stay coherent when one mechanism degrades. It describes:

- **Native EnvoyMesh today**: libp2p discovery stack, EMP-signed traffic, local vault and audits ([p2p discovery guide](./p2p-discovery.md)).
- **Optional control-plane extension**: Matrix (or any HTTPS rendezvous) as **signaling and buffering**—**not** a replacement for libp2p bulk transport.

Matrix does **not** repair a broken **data-plane** socket by itself; it supplies a **usually reachable HTTPS signaling path** so peers **coordinate how** Noise/libp2p pipes are built. Firewall rules and NAT geometry still matter at dial time.

**Terminology**

| Plane | Role |
| --- | --- |
| **Control plane** (optional Matrix) | Hints, invites, optional offline-visible envelopes — low bandwidth. |
| **Data plane** (libp2p + local vault) | Throughput, Noise sessions, large payloads, local integrity. |

If Matrix is absent, native bootstrap/DHT/relay/seeds/capability topics still implement stages **1–2** in spirit.

---

## 1. Auto-discovery workflow (“the Map”)

Move from **searching** for a peer to **subscribing** to bounded relationship state (bond-scoped rooms), while native discovery keeps working in parallel.

**Self-awareness / addressing**

- **Shipped:** Local interfaces + libp2p **AutoNAT** + relay-discovered paths help infer **observed** WAN-facing addresses (`wan-default`; see [p2p-discovery](./p2p-discovery.md)).
- **Design:** Optionally complement with operator STUN-like probes **only if** you standardize them — not required for Matrix signaling itself.

**Presence publication (optional Matrix)**

- Push a Matrix **state event** (e.g. `org.envoymesh.node_info`) to rooms tied to **bonds**.
- **Payload (concept):** libp2p PeerID (`12D3KooW…`), current multiaddrs (LAN / direct WAN / relay), optional `supported_protocols` list.

**Peer tracking**

- Maintain a **local address book / hint cache**: merge Matrix **/sync** updates with `discovery-seeds.json`, DHT, mDNS.
- **Reaction model:** When a bonded peer’s coordinates change, **update the cache** — you are not doing a global blind search.

**Failure isolation:** If Matrix is down, native discovery + seeds + audit-backed hints still run; Envoy identity does not depend on the homeserver.

---

## 2. Setup connection flow (“the Handshake”)

Turn **merged hints** into a **live libp2p connection**, then align **transport** with **Envoy trust**.

**Hint merging**

- Single **prioritized dial list**: Matrix hints **plus** mDNS / DHT / persisted seeds (same merge target as today’s dial logic, extended with control-plane adds).

**Dialing strategy (conceptual order)**

1. **LAN** — same-subnet multiaddrs / mDNS.
2. **Direct WAN** — public/reachable multiaddrs from cache.
3. **Relayed WAN** — `/p2p-circuit/…` when direct paths fail.
4. **Coordinated hole punch** — if product requires it, exchange a **short-lived `connection_request` (or similar) via Matrix** so both sides run DCUtR / simultaneous dial within a window — *optional product feature*, not automatic magic.

**Authentication**

- **Noise** at libp2p layer.
- **EMP** verification for application intent; Matrix membership proves **coordination consent**, not Envoy policy by itself.
- **Binding:** Transport PeerID must match the PeerID **you trust for that bond** (from prior pairing/signal — exact binding rule is product code).

**Failure isolation:** No socket ⇒ no EMP over mesh; retries and backoff stay in agent logic.

---

## 3. Communication workflow (“the Intent”)

Route **signed Envoy envelopes** on the **best path**; avoid duplicate handling when both paths fire.

**Header-first routing**

- Every envelope carries **`correlationId`**, intent, priority — already aligned with Envoy patterns.

**Path selection**

- **Active mesh:** Open libp2p stream on `/envoymesh/*` — binary framed payloads (fast path).
- **Buffered fallback (optional):** If mesh is unavailable within policy, post a **small** E2EE Matrix event (Olm/Megolm) containing encrypted payload **or** a **pointer** (task id + content hash) per threat model.

**Reconciliation**

- Receiver **dedupes by `correlationId`**: mesh delivery wins if both arrive; Matrix-only delivery is processed once and can feed **morning-report** / digest flows.
- **Verification:** Matrix must not bypass inbound guards — same EMP verification rules as wire.

**Metadata:** Homeservers still see membership, timing, event shape — even when bodies are E2EE.

---

## 4. Data plane (“the Cargo”)

Heavy, sensitive bulk stays **off** third-party timelines.

**Content & vault**

- Large vault files / context chunks: **hash-addressed design target** (CID-style) — implement before claiming resume semantics globally.
- **Shared vault** roots; transfer only with valid **voucher** from the communication layer.

**libp2p-first transfer**

- **No large blobs** on Matrix by default.
- If P2P is impossible, transfers stay **pending** (local queue) rather than stuffing Matrix rooms.

**Resumption (aspirational)**

- Chunked + hash-verified transfers can **resume** across network changes (LAN → relay) once implemented; today’s repo should document only what exists in code.

---

## Implementation summary

| Workflow | Protocol (concept) | Role |
| --- | --- | --- |
| **Discovery** | Matrix (HTTPS) + native mesh | Reliable **exchange of dialable hints**; native stack still discovers |
| **Connection** | libp2p (QUIC/TCP/relay/DCUtR) | NAT traversal and encrypted pipes |
| **Communication** | Hybrid EMP / optional Matrix | Intent routing + offline buffering |
| **Data plane** | libp2p streams + vault | High-throughput, verifiable movement |

---

## Thin PoC path (validate before big rewrite)

1. **Keep** current libp2p core and `wan-default` behavior.
2. Add a **minimal Matrix client** (headless): one **bond-scoped** room, two test users.
3. **Publish** compact JSON (`peer_id`, `multiaddrs[]`) on connect / timer.
4. On **/sync**, **merge** into the same hint path your node already uses for `dial()`.
5. **Measure:** dial success rate **with** Matrix hints vs **without**, same machines (VPS / Mac / Windows).

If Matrix hints unlock dials that DHT/bootstrap alone rarely find, you have evidence the **control-plane uplift** is worth deeper investment — without committing to full dual-path EMP replication yet.

---

## Related

- [Redesign strategy](./redesign-strategy.md) — early-stage charter for breaking changes and doc hygiene.
- [User stories vs hybrid design (stress-test)](./user-stories-hybrid-evaluation.md)
- [P2P discovery guide](./p2p-discovery.md) — operational defaults, `connectivity-status`, seeds.
- [Implementation plan](./implementation-plan.md) — **Phase 4G** optional hybrid signaling; phased delivery vs open items.
