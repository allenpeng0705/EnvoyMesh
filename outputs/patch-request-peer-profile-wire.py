"""Step 48 — wire requestPeerProfile + _requestPeerProfileOnce as a runtime delegation."""
import sys

p = "apps/node/src/node-service-impl.ts"
with open(p) as f:
    c = f.read()

# 1. Add the import.
ANCHOR = "} from \"./node-service-handlers-small-profile-delegations.js\";"
if ANCHOR not in c:
    sys.exit("import anchor not found")
NEW = ANCHOR + """

import {
  requestPeerProfileViaRuntime,
  type RequestPeerProfileContext,
} from "./node-service-handlers-request-peer-profile.js";"""
c = c.replace(ANCHOR, NEW, 1)
print("import added")

# 2. Replace requestPeerProfile (public method).
old_public = '''  async requestPeerProfile(ownerId: string): Promise<{ ok: boolean; reason?: string }> {
    const key = ownerId.trim();
    if (!key) {
      return { ok: false, reason: "owner id required" };
    }
    const inflight = this._profileRequestInflight.get(key);
    if (inflight) {
      return inflight;
    }
    const lastAt = this._profileRequestLastAt.get(key) ?? 0;
    if (Date.now() - lastAt < NodeServiceImpl._PROFILE_REQUEST_COOLDOWN_MS) {
      const cached = this._peerProfileCacheStore
        ? await this._peerProfileCacheStore.get(key)
        : undefined;
      if (cached) {
        return { ok: true };
      }
    }

    const run = this._requestPeerProfileOnce(key);
    this._profileRequestInflight.set(key, run);
    try {
      return await run;
    } finally {
      this._profileRequestInflight.delete(key);
      this._profileRequestLastAt.set(key, Date.now());
    }
  }'''

new_public = '''  async requestPeerProfile(ownerId: string): Promise<{ ok: boolean; reason?: string }> {
    return requestPeerProfileViaRuntime(this._requestPeerProfileContext(), ownerId);
  }'''

if old_public not in c:
    sys.exit("public body not found")
c = c.replace(old_public, new_public, 1)
print("requestPeerProfile replaced")

# 3. Replace _requestPeerProfileOnce (private method).
old_private = '''  private async _requestPeerProfileOnce(ownerId: string): Promise<{ ok: boolean; reason?: string }> {
    const mesh = this._requireMesh();
    const profile = this._requireProfile();
    if (!this._contactOwnerKeyStore || !this._peerProfileCacheStore) {
      return { ok: false, reason: "profile cache not initialized" };
    }
    try {
      const records = await this._peerDirectoryStore.listPeerRecords();
      const connectedPeerIds = mesh.getConnectedPeerIds();
      const liveConnected = pickLibp2pFromConnectedPeers(records, ownerId, connectedPeerIds);
      const resolved = liveConnected
        ? { transportPeerId: liveConnected.peerId, listenAddrs: liveConnected.listenAddrs }
        : await this._resolveLibp2pPeerForBondOwner(ownerId);
      if (!resolved) {
        return { ok: false, reason: "peer not in directory (no libp2p route)" };
      }
      const { transportPeerId, listenAddrs } = resolved;
      if (!liveConnected && !mesh.getPeerConnectionInfo(transportPeerId).connected) {
        return { ok: false, reason: "peer not connected" };
      }
      let envelopeRecipientPeerId: string | undefined;
      try {
        envelopeRecipientPeerId = (await this._resolvePeerTransportForOwner(ownerId)).recipientEnvelopePeerId;
      } catch {
        const records = await this._peerDirectoryStore.listPeerRecords();
        const rec = pickBestLibp2pPeerDirectoryRecord(records, ownerId);
        if (rec?.devicePublicKeyPem) {
          envelopeRecipientPeerId = derivePeerId(rec.devicePublicKeyPem);
        }
      }
      const reply = await sendProfileRequest({
        mesh,
        profile,
        transportPeerId,
        envelopeRecipientPeerId: envelopeRecipientPeerId ?? transportPeerId,
        listenAddrs,
        dialHintsFor: (peerId, addrs) => this._dialHintsForChat(peerId, addrs ?? listenAddrs),
      });
      const cached = await handleInboundProfileSync({
        envelope: reply,
        contactOwnerKeyStore: this._contactOwnerKeyStore,
        peerProfileCache: this._peerProfileCacheStore,
      });
      if (cached.handled) {
        this.emit("profile:updated", { ownerId: cached.ownerId });
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, reason: err instanceof Error ? err.message : String(err) };
    }
  }'''

new_private = '''  // The runtime now owns _requestPeerProfileOnce's body; the in-flight
  // dedupe + cooldown live there. We keep a thin wrapper here only to
  // preserve the test surface (`_requestPeerProfileOnce` is private
  // and called from a few tests).
  private async _requestPeerProfileOnce(ownerId: string): Promise<{ ok: boolean; reason?: string }> {
    return requestPeerProfileViaRuntime(this._requestPeerProfileContext(), ownerId);
  }'''

if old_private not in c:
    sys.exit("private body not found")
c = c.replace(old_private, new_private, 1)
print("_requestPeerProfileOnce replaced")

# 4. Add the factory right after _smallProfileDelegationsContext.
ANCHOR = "  private _smallProfileDelegationsContext(): SmallProfileDelegationsContext {"
FACTORY = """  private _requestPeerProfileContext(): RequestPeerProfileContext {
    return {
      requireMesh: () => this._requireMesh() as never,
      requireProfile: () => this._requireProfile(),
      getContactOwnerKeyStore: () => this._contactOwnerKeyStore ?? undefined,
      getPeerProfileCacheStore: () => this._peerProfileCacheStore ?? undefined,
      getPeerDirectoryStore: () => this._peerDirectoryStore,
      resolvePeerTransportForOwner: (id) =>
        this._resolvePeerTransportForOwner(id) as Promise<{ recipientEnvelopePeerId: string }>,
      resolveLibp2pPeerForBondOwner: (id) =>
        this._resolveLibp2pPeerForBondOwner(id) as Promise<{ transportPeerId: string; listenAddrs: string[] } | undefined>,
      dialHintsForChat: (peerId, listenAddrs) =>
        this._dialHintsForChat(peerId, listenAddrs),
      emit: (event, payload) => this.emit?.(event as never, payload as never),
      getProfileRequestCooldownMs: () => NodeServiceImpl._PROFILE_REQUEST_COOLDOWN_MS,
      getInFlightMap: () => this._profileRequestInflight,
      getLastAtMap: () => this._profileRequestLastAt,
    };
  }

""" + ANCHOR
c = c.replace(ANCHOR, FACTORY, 1)
print("factory added")

with open(p, "w") as f:
    f.write(c)
print("OK")