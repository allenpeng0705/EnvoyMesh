import { randomUUID } from "node:crypto";
import type {
  ApprovalQueue,
  CapabilityTopicProviderHit,
  DiscoverCapabilityTopicParams,
  DiscoverCapabilityTopicResult,
  DiscoveryForwardApprovalPayload,
  MorningReportEntry,
  MultiHopDiscoveryMatch,
  MultiHopDiscoverySessionView,
  PeerSearchResult,
  RequestMultiHopDiscoveryParams,
  RequestMultiHopDiscoveryResult,
  SearchQuery,
} from "@envoymesh/api";
import { buildOwnerDidPresentation, didKeysMatch, parseDidLookupInput } from "@envoymesh/api";
import { locationSearchTopics } from "@envoymesh/api";
import { createDiscoveryReferralAttestation } from "@envoymesh/api/discovery-referral-attestation";
import type { HumanProfilePayload } from "@envoymesh/protocol";
import {
  createAuditEvent,
  buildMorningReportDigest,
  type ContactOwnerKeyStore,
  type LocalPeerDirectoryStore,
  type LocalTaskStore,
  type LocalTrustStore,
  type MultiHopDiscoverySession,
  type MultiHopDiscoveryStore,
} from "@envoymesh/local-store";
import {
  createDiscoveryRequestPayload,
  createDiscoveryResponsePayload,
  createUnsignedEnvelope,
  parseDiscoveryResponsePayload,
  RendezvousResponsePayloadSchema,
  type EnvoyEnvelope,
} from "@envoymesh/protocol";
import { derivePeerId, signUnsignedEnvelope } from "@envoymesh/identity";
import type { NodeProfile } from "@envoymesh/api";
import type { PeerProfileCacheStore } from "@envoymesh/local-store";
import type { EnvoyMesh } from "@envoymesh/network";
import {
  sendEnvelopeWithRetry,
  sendExpectReplyWithRetry,
} from "./chat-outbound-deliver.js";
import { deliverOutboundExpectReply } from "./mesh-outbound-helper.js";
import { displayNameTopicFor, interestTopicFor } from "./capability-discovery.js";
import type { createNodeConfigStore } from "./node-config-store.js";
import type { DiscoverySeedStore } from "./discovery-seed-store.js";
import {
  buildForwardedDiscoveryPayload,
  queueDiscoveryForwardApproval,
} from "./discovery-forward.js";

export interface NodeDiscoveryRuntimeDeps {
  getProfile(): NodeProfile | undefined;
  requireProfile(): NodeProfile;
  getMesh(): EnvoyMesh | undefined;
  requireMesh(): EnvoyMesh;
  getReachableMesh(): EnvoyMesh | undefined;
  trustStore: LocalTrustStore;
  peerDirectoryStore: LocalPeerDirectoryStore;
  configStore: ReturnType<typeof createNodeConfigStore>;
  taskStore?: LocalTaskStore;
  discoverySeedStore?: DiscoverySeedStore;
  contactOwnerKeyStore: ContactOwnerKeyStore | null;
  multihopDiscoveryStore: MultiHopDiscoveryStore | null;
  peerProfileCacheStore?: PeerProfileCacheStore | null;
  warmLocalPeerProfiles?: (ownerIds: string[]) => Promise<void>;
  getApprovalQueue(): ApprovalQueue | null;
  resolvePeerTransportForOwner(targetOwnerId: string): Promise<{
    transportPeerId: string;
    recipientEnvelopePeerId: string | undefined;
    listenAddrs: string[] | undefined;
  }>;
  dialHintsForChat(recipientPeerId: string, peerListenAddrs: string[] | undefined): Promise<string[]>;
  emitMultiHopUpdate(session: MultiHopDiscoverySessionView): void;
  loadHumanProfile?: () => Promise<HumanProfilePayload | undefined>;
  /**
   * Cross-NAT fallback when local DHT returns 0 providers for a topic.
   * Issues a `relay.lookup` (by topicHash) to the node's known bootstrap
   * relays so peers behind NAT-only circuits can still be discovered via
   * the relay server's roster.
   */
  queryRelayLookupByTopic?(params: {
    topic: string;
    topicHash: string;
    maxResults: number;
  }): Promise<PeerSearchResult[]>;
  /**
   * The bundled sponsor's identity (the peer the local node was
   * shipped to auto-bond to, e.g. via a DMG installer). The bundled
   * `contactUri` carries `displayName`, `ownerId`, and `peerId` —
   * sources the local peer directory record may lack before a bond
   * has been established. Surfacing it lets `searchLocalPeers` match
   * a name like "Allen Peng" even when the peer record has an empty
   * `listenAddrs` list and no displayName populated yet.
   */
  getBundledSponsorIdentity?(): Promise<{
    ownerId: string;
    peerId: string;
    displayName: string;
  } | undefined>;
}

export class NodeDiscoveryRuntime {
  constructor(private readonly deps: NodeDiscoveryRuntimeDeps) {}

    async searchPeers(query: SearchQuery): Promise<PeerSearchResult[]> {
      const maxResults = query.maxResults ?? 20;

      if (query.did?.trim()) {
        return this.searchByDid(query.did.trim(), maxResults);
      }

      // 1. Direct peer ID lookup via DHT (if peerId is specified)
      if (query.peerId) {
        return this.searchByPeerId(query.peerId, maxResults);
      }

      // 2. Explicit DHT capability topic(s) (Phase 15A / 17 geo)
      const topicQueries = [
        ...(query.topic?.trim() ? [query.topic.trim()] : []),
        ...(query.topics ?? []).map((t) => t.trim()).filter(Boolean),
      ];
      if (topicQueries.length > 0) {
        const results: PeerSearchResult[] = [];
        for (const topic of [...new Set(topicQueries)]) {
          const topicResults = await this.searchByTopic(topic, maxResults);
          for (const r of topicResults) {
            if (!results.some((existing) => existing.nodeId === r.nodeId)) {
              results.push(r);
            }
          }
        }
        const selfPeerId = this.deps.getMesh()?.peerId;
        const selfOwnerId = this.deps.getProfile()?.owner.ownerId;
        return results
          .filter(
            (r) =>
              r.nodeId !== selfPeerId
              && r.ownerId !== selfOwnerId
              && r.nodeId !== selfOwnerId,
          )
          .slice(0, maxResults);
      }

      // 3. Determine search mode based on network configuration
      const config = await this.deps.configStore.load();
      const isPublicNetwork = config?.bootstrapPresets && config.bootstrapPresets.length > 0;
      const isPrivateRelay = config?.relayEnabled && config?.configuredRelays && config.configuredRelays.length > 0;
      // Any DHT-capable or relay-capable config can search topics.
      // searchByTopic() has a relay.lookup fallback when DHT returns empty,
      // so the gate just needs to allow the search to run — not guarantee DHT.
      const canSearchTopics = isPublicNetwork || isPrivateRelay;

      const results: PeerSearchResult[] = [];

      // 3. Username-based discovery: search DHT for username:xxx topic
      if (canSearchTopics && query.username) {
        const usernameResults = await this.searchByTopic(`username:${query.username.toLowerCase()}`, maxResults);
        for (const r of usernameResults) {
          if (!results.some((existing) => existing.nodeId === r.nodeId)) {
            results.push({ ...r, username: query.username });
          }
        }
      }

      // 3b. Display-name discovery: search DHT for displayname:<slug> topic.
      // The Social UI's "By name" search sends free-text (`queryText`) that
      // the user types in — typically a display name like "Allen Peng", not
      // the @handle. Without this, name search is limited to local directory
      // hits (which are empty for a never-bonded peer). Both sides route
      // through `displayNameTopicFor` so the on-wire slugs match exactly.
      if (canSearchTopics && query.queryText) {
        const dnTopic = displayNameTopicFor(query.queryText);
        if (dnTopic) {
          const dnResults = await this.searchByTopic(dnTopic, maxResults);
          for (const r of dnResults) {
            if (!results.some((existing) => existing.nodeId === r.nodeId)) {
              results.push(r);
            }
          }
        }
      }

      // 4. Public libp2p network: search by interest as DHT topic.
      // Interests are advertised under the canonical `interest:<slug>` topic
      // (see computePublicDiscoveryTopics + buildInterestTopics). Normalize
      // the raw query interests through `interestTopicFor` so the search key
      // matches the advertised key — without this, a peer that picked
      // "Machine Learning" advertises `interest:machine-learning` but this
      // search would look up "machine learning" and miss it.
      if (canSearchTopics && query.interests && query.interests.length > 0) {
        for (const interest of query.interests) {
          const topic = interestTopicFor(interest);
          if (!topic) continue;
          const topicResults = await this.searchByTopic(topic, maxResults);
          for (const r of topicResults) {
            if (!results.some((existing) => existing.nodeId === r.nodeId)) {
              results.push(r);
            }
          }
        }
      }

      // 5. Private relay network: search via rendezvous servers
      if (isPrivateRelay && query.interests && query.interests.length > 0) {
        const rendezvousResults = await this.searchByRendezvous(query.interests);
        for (const r of rendezvousResults) {
          if (!results.some((existing) => existing.nodeId === r.nodeId)) {
            results.push(r);
          }
        }
      }

      // 7. LAN / local profile search — always merge for name or hobby queries
      if (query.username || (query.interests && query.interests.length > 0) || query.queryText) {
        await this.warmLocalPeerProfilesForSearch(query, maxResults);
        const localResults = await this.searchLocalPeers(query, maxResults);
        for (const r of localResults) {
          if (!results.some((existing) => existing.nodeId === r.nodeId || existing.ownerId === r.ownerId)) {
            results.push(r);
          }
        }
      }

      // 8. If neither public network nor relays configured, local-only mode
      if (!isPublicNetwork && !isPrivateRelay && results.length === 0) {
        await this.warmLocalPeerProfilesForSearch(query, maxResults);
        return this.searchLocalPeers(query, maxResults);
      }

      // Filter out self from results (don't show yourself in search results)
      // Check against both ownerId AND peerId since DHT discovery returns peer IDs
      const selfOwnerId = this.deps.getProfile()?.owner.ownerId;
      const selfPeerId = this.deps.getMesh()?.peerId;
      const filteredResults = results.filter((r) =>
        r.nodeId !== selfOwnerId
        && r.nodeId !== selfPeerId
        && r.ownerId !== selfOwnerId
      );

      return filteredResults.slice(0, maxResults);
    }

    private async searchByDid(input: string, maxResults: number): Promise<PeerSearchResult[]> {
      const parsed = parseDidLookupInput(input);
      if (parsed.kind === "invalid") {
        return [];
      }

      const trustRecords = await this.deps.trustStore.listTrustRecords();
      const bonded = trustRecords.filter((row) => row.level !== "blocked");
      const displayNameByOwner = new Map(
        bonded.map((row) => [row.peerOwnerId, row.displayName ?? row.peerOwnerId]),
      );
      const peerRecords = await this.deps.peerDirectoryStore.listPeerRecords();
      const peerByOwner = new Map(peerRecords.map((row) => [row.ownerId, row]));

      const results: PeerSearchResult[] = [];

      const pushMatch = (ownerId: string, did?: string, trustLevel?: string) => {
        const peer = peerByOwner.get(ownerId);
        const displayName = displayNameByOwner.get(ownerId) ?? ownerId;
        results.push({
          nodeId: peer?.peerId ?? ownerId,
          ownerId,
          displayName,
          interests: [],
          profileVisibility: "contacts",
          did,
          discoverySource: "did-lookup",
          trustLevel,
        });
      };

      const selfProfile = this.deps.getProfile();
      if (selfProfile) {
        const selfPresentation = buildOwnerDidPresentation({
          ownerId: selfProfile.owner.ownerId,
          publicKeyPem: selfProfile.owner.publicKeyPem,
        });
        const selfMatch =
          (parsed.kind === "envoy-owner" && parsed.ownerId === selfPresentation.ownerId) ||
          (parsed.kind === "did-key" && parsed.did && didKeysMatch(parsed.did, selfPresentation.did));
        if (selfMatch) {
          pushMatch(selfPresentation.ownerId, selfPresentation.did, "self");
        }
      }

      for (const bond of bonded) {
        if (parsed.kind === "envoy-owner" && parsed.ownerId === bond.peerOwnerId) {
          pushMatch(bond.peerOwnerId, undefined, bond.level);
          continue;
        }
        if (parsed.kind === "did-key" && parsed.did && this.deps.contactOwnerKeyStore) {
          const keyRow = await this.deps.contactOwnerKeyStore.get(bond.peerOwnerId);
          if (!keyRow) continue;
          const presentation = buildOwnerDidPresentation({
            ownerId: bond.peerOwnerId,
            publicKeyPem: keyRow.ownerPublicKeyPem,
          });
          if (didKeysMatch(parsed.did, presentation.did)) {
            pushMatch(bond.peerOwnerId, presentation.did, bond.level);
          }
        }
      }

      return results.slice(0, maxResults);
    }

    private async searchByPeerId(peerId: string, maxResults: number): Promise<PeerSearchResult[]> {
      const mesh = this.deps.getMesh();
      if (!mesh) {
        console.warn("[searchPeers] Node not initialized");
        return [];
      }

      try {
        // Try to find the peer via DHT first (if enabled)
        const node = (mesh as any).node;
        if (node?.peerRouting) {
          const peer = await node.peerRouting.findPeer(peerId, { timeout: 10000 });
          console.log(
            `[searchPeers] found ${peerId.slice(0, 16)}… via DHT (${peer.multiaddrs.length} addr(s))`,
          );
          return [{
            nodeId: peer.id.toString(),
            ownerId: peer.id.toString(),
            displayName: peer.id.toString().slice(0, 12) + "...",
            interests: [],
            profileVisibility: "public",
          }];
        }
        // Direct dial attempt
        await mesh.dial(`/p2p/${peerId}`);
        console.log(`[searchPeers] found ${peerId.slice(0, 16)}… via direct dial`);
        return [{
          nodeId: peerId,
          ownerId: peerId,
          displayName: peerId.slice(0, 12) + "...",
          interests: [],
          profileVisibility: "public",
        }];
      } catch (err) {
        console.log(`[searchPeers] Peer ${peerId} not found via DHT or direct dial:`, err instanceof Error ? err.message : err);
        return [];
      }
    }

    private async searchByTopic(topic: string, maxResults: number): Promise<PeerSearchResult[]> {
      const mesh = this.deps.getMesh();
      if (!mesh) {
        console.warn("[searchPeers] Node not initialized for topic search");
        return [];
      }

      console.log(`[searchPeers] Searching DHT for topic: "${topic}" (limit: ${maxResults})`);
      let providers: Awaited<ReturnType<EnvoyMesh["findCapabilityTopicProviders"]>> = [];
      try {
        providers = await mesh.findCapabilityTopicProviders(topic, {
          limit: maxResults,
          queryTimeoutMs: 8_000,
        });
        console.log(`[searchPeers] Found ${providers.length} providers for topic "${topic}"`);
      } catch (err) {
        console.log(`[searchPeers] Topic "${topic}" query failed:`, err instanceof Error ? err.message : err);
      }
      let trustRecords: Awaited<ReturnType<typeof this.deps.trustStore.listTrustRecords>> = [];
      let peerRecords: Awaited<ReturnType<typeof this.deps.peerDirectoryStore.listPeerRecords>> = [];
      try {
        trustRecords = await this.deps.trustStore.listTrustRecords();
        peerRecords = await this.deps.peerDirectoryStore.listPeerRecords();
      } catch (err) {
        console.warn("[searchPeers] Failed to load trust/peer records, continuing without enrichment:", err instanceof Error ? err.message : err);
      }
      const trustByPeerId = new Map<string, (typeof trustRecords)[number]>();
      for (const record of trustRecords) {
        const peer = peerRecords.find((p) => p.ownerId === record.peerOwnerId);
        if (peer?.peerId) {
          trustByPeerId.set(peer.peerId, record);
        }
      }
      if (providers.length > 0 && this.deps.discoverySeedStore) {
        const addrs = providers.flatMap((p) => p.multiaddrs ?? []);
        if (addrs.length > 0) {
          await this.deps.discoverySeedStore.upsertMany(addrs, "capability-topic");
        }
      }
      const dhtResults = providers.map((provider) => {
        const trust = trustByPeerId.get(provider.peerId);
        const peerRecord = peerRecords.find((p) => p.peerId === provider.peerId);
        return {
          nodeId: provider.peerId,
          ownerId: peerRecord?.ownerId ?? provider.peerId,
          displayName: trust?.displayName ?? provider.peerId.slice(0, 12) + "...",
          interests: [topic],
          profileVisibility: "public" as const,
          discoverySource: "dht-capability-topic" as const,
          trustLevel: trust?.level,
          signedRecordValid: provider.signedRecord ? true : provider.signedRecordInvalid ? false : undefined,
        };
      });

      // Cross-NAT fallback: if local DHT returned no providers (often the case
      // when the node is behind NAT and the local routing table is empty),
      // ask the bootstrap relays for the topicHash via relay.lookup. The
      // relay server's roster is populated by other clients' relay.checkin
      // advertisements, so it works without a direct DHT connection.
      if (dhtResults.length === 0 && this.deps.queryRelayLookupByTopic) {
        try {
          const { cidForCapabilityTopic } = await import("@envoymesh/network");
          const cid = await cidForCapabilityTopic(topic);
          const fallback = await this.deps.queryRelayLookupByTopic({
            topic,
            topicHash: cid.toString(),
            maxResults,
          });
          if (fallback.length > 0) {
            console.log(
              `[searchPeers] relay-roster fallback returned ${fallback.length} peers for topic "${topic}"`,
            );
          }
          return fallback;
        } catch (err) {
          console.log(
            `[searchPeers] relay-roster fallback failed for "${topic}":`,
            err instanceof Error ? err.message : err,
          );
          return dhtResults;
        }
      }

      return dhtResults;
    }

    async discoverCapabilityTopic(params: DiscoverCapabilityTopicParams): Promise<DiscoverCapabilityTopicResult> {
      const topic = params.topic.trim();
      if (!topic) {
        throw new Error("discoverCapabilityTopic: topic is required");
      }
      const maxResults = params.maxResults ?? 20;
      const providers = await this.searchByTopic(topic, maxResults);
      const hits: CapabilityTopicProviderHit[] = [];

      for (const provider of providers) {
        const hit: CapabilityTopicProviderHit = {
          peerId: provider.nodeId,
          multiaddrs: [],
          ownerId: provider.ownerId,
          displayName: provider.displayName,
          trustLevel: provider.trustLevel,
          signedRecordValid: provider.signedRecordValid,
          discoverySource: "dht-capability-topic",
        };

        if (params.followUpDiscovery && provider.trustLevel && provider.trustLevel !== "blocked") {
          const peerRecord = await this.deps.peerDirectoryStore.getPeerByOwnerId(provider.ownerId);
          const transportPeerId = peerRecord?.peerId ?? provider.nodeId;
          const profile = this.deps.getProfile();
          const mesh = this.deps.getMesh();
          if (peerRecord && profile && mesh) {
            try {
              const { recipientEnvelopePeerId } = await this.deps.resolvePeerTransportForOwner(provider.ownerId);
              const dialHints = await this.deps.dialHintsForChat(transportPeerId, peerRecord.listenAddrs ?? []);
              const unsigned = createUnsignedEnvelope({
                senderPeerId: derivePeerId(profile.device.publicKeyPem),
                senderPublicKey: profile.device.publicKeyPem,
                senderRole: "human",
                recipientPeerId: recipientEnvelopePeerId,
                recipientRole: "human",
                intent: "discovery.request",
                payload: createDiscoveryRequestPayload({
                  requesterOwnerId: profile.owner.ownerId,
                  requestedTagHashes: [],
                  requestedCapabilities: params.requestedCapabilities ?? [],
                  maxResults: 5,
                  requestedSensitivity: "public",
                  maxHops: params.maxHops ?? 2,
                  currentHop: 0,
                }),
                correlationId: randomUUID(),
              });
              const envelope = signUnsignedEnvelope(unsigned, profile.device.privateKeyPem);
              const reply = await sendExpectReplyWithRetry({
                mesh,
                transportPeerId,
                envelope,
                dialHints,
                timeoutMs: 15_000,
              });
              if (reply.intent === "discovery.response") {
                const resp = parseDiscoveryResponsePayload(reply.payload);
                hit.followUpMatchCount = resp.matches.length;
              } else {
                hit.followUpError = `unexpected reply intent ${reply.intent}`;
              }
            } catch (error) {
              hit.followUpError = error instanceof Error ? error.message : String(error);
            }
          } else if (!peerRecord) {
            hit.followUpError = "not bonded — discovery.request requires peer directory entry";
          }
        }

        hits.push(hit);
      }

      if (this.deps.taskStore) {
        await this.deps.taskStore.appendAuditEvent(
          createAuditEvent({
            type: "p2p.trace",
            direction: "outbound",
            protocol: "discovery.capability.find.ok",
            outcome: "record",
            summary: `discoverCapabilityTopic topic=${topic} providers=${hits.length} followUp=${Boolean(params.followUpDiscovery)}`,
          }),
        );
      }

      return { topic, providers: hits };
    }

    async getMorningReport(params?: { limit?: number }): Promise<MorningReportEntry[]> {
      if (!this.deps.taskStore) {
        return [];
      }
      const [trustRecords, peerRecords, discoveryEvents] = await Promise.all([
        this.deps.trustStore.listTrustRecords(),
        this.deps.peerDirectoryStore.listPeerRecords(),
        this.deps.taskStore.readDiscoveryEvents(),
      ]);
      const entries = buildMorningReportDigest({
        trustRecords,
        peerDirectoryRecords: peerRecords,
        discoveryEvents,
        limit: params?.limit ?? 10,
      });

      const humanProfile = this.deps.loadHumanProfile
        ? await this.deps.loadHumanProfile().catch(() => undefined)
        : undefined;
      const loc = humanProfile?.discoveryLocation;
      const precision = humanProfile?.discoveryLocationPrecision;
      if (
        loc?.countryCode &&
        loc.city?.trim() &&
        precision &&
        precision !== "hidden" &&
        (precision === "city" || precision === "town" || precision === "nearby")
      ) {
        const topics = locationSearchTopics({ location: loc, scope: "city" });
        if (topics.length > 0) {
          try {
            const peers = await this.searchPeers({ topics, maxResults: 50 });
            if (peers.length > 0) {
              entries.unshift({
                ownerId: `geo-city:${loc.countryCode}-${loc.city}`,
                displayName: loc.city,
                trustLevel: "unknown",
                score: peers.length,
                reason: "geo-city-summary",
                discoveryMatchCount: peers.length,
                geoCitySummary: {
                  peerCount: peers.length,
                  cityLabel: loc.city,
                },
              });
            }
          } catch {
            /* optional geo summary */
          }
        }
      }

      return entries;
    }

  queueDiscoveryForwardFromInbound(input: {
    envelope: EnvoyEnvelope;
    requesterOwnerId: string;
    trustLevel: string;
    correlationId: string | undefined;
  }): string | undefined {
    const approvalQueue = this.deps.getApprovalQueue();
    if (!approvalQueue) return undefined;
    const itemId = queueDiscoveryForwardApproval(approvalQueue, {
        envelope: input.envelope,
        requesterOwnerId: input.requesterOwnerId,
        trustLevel: input.trustLevel,
        correlationId: input.correlationId,
        excludeOwnerIds: [input.requesterOwnerId, this.deps.getProfile()?.owner.ownerId ?? ""].filter(Boolean),
      });
      if (itemId && input.correlationId?.trim()) {
        void this.notifyDiscoveryForwardPending({
          requesterOwnerId: input.requesterOwnerId,
          requestMessageId: input.envelope.messageId,
          correlationId: input.correlationId,
        });
      }
      return itemId;
    }

    private sessionPendingHop2Count(session: MultiHopDiscoverySessionView): number {
      return session.awaitingHop2ViaBonds?.length ?? session.pendingForwardApprovals ?? 0;
    }

    private async publishSessionWithPending(session: MultiHopDiscoverySession): Promise<void> {
      const view: MultiHopDiscoverySessionView = {
        ...session,
        awaitingHop2ViaBonds: session.awaitingHop2ViaBonds ?? [],
        pendingForwardApprovals: (session.awaitingHop2ViaBonds ?? []).length,
      };
      await this.publishMultiHopSession(view);
    }

  countPendingDiscoveryForwards(correlationId: string): number {
    const approvalQueue = this.deps.getApprovalQueue();
    if (!approvalQueue) return 0;
    return approvalQueue.listPending().filter((item) => {
        if (item.actionType !== "discovery_forward") return false;
        return item.context.metadata?.correlationId === correlationId;
      }).length;
    }

  private publishMultiHopSession(session: MultiHopDiscoverySessionView): void {
    this.deps.emitMultiHopUpdate(session);
  }

    async getMultiHopDiscoverySession(
      correlationId: string,
    ): Promise<MultiHopDiscoverySessionView | undefined> {
      if (!this.deps.multihopDiscoveryStore) return undefined;
      const session = await this.deps.multihopDiscoveryStore.getSession(correlationId.trim());
      if (!session) return undefined;
      const awaitingHop2ViaBonds = session.awaitingHop2ViaBonds ?? [];
      return {
        ...session,
        awaitingHop2ViaBonds,
        pendingForwardApprovals: awaitingHop2ViaBonds.length,
      };
    }

    async ingestInboundMultiHopDiscoveryResponse(params: {
      correlationId: string;
      responderOwnerId: string;
      matches: Array<{
        ownerId: string;
        peerId: string;
        hopDistance?: number;
        matchedCapabilities: string[];
        matchedTagHashes: string[];
      }>;
      forwardPendingAck?: boolean;
    }): Promise<void> {
      const correlationId = params.correlationId.trim();
      if (!correlationId || !this.deps.multihopDiscoveryStore) return;
      const session = await this.deps.multihopDiscoveryStore.getSession(correlationId);
      if (!session) return;

      const profile = this.deps.getProfile();
      const trustRecord = await this.deps.trustStore.getTrustRecord(params.responderOwnerId);
      const viaLabel = trustRecord?.displayName ?? params.responderOwnerId;
      const hopMatches: MultiHopDiscoveryMatch[] =
        params.forwardPendingAck && params.matches.length === 0
          ? []
          : params.matches.map((match) => ({
              ownerId: match.ownerId,
              peerId: match.peerId,
              hopDistance: match.hopDistance ?? 2,
              matchedCapabilities: match.matchedCapabilities,
              matchedTagHashes: match.matchedTagHashes,
              viaOwnerId: params.responderOwnerId,
              viaDisplayName: viaLabel,
              referralOwnerId: params.responderOwnerId,
              trustPath: profile
                ? `${profile.owner.ownerId} → ${params.responderOwnerId} → ${match.ownerId}`
                : `${params.responderOwnerId} → ${match.ownerId}`,
            }));

      const updated = await this.deps.multihopDiscoveryStore.applyInboundResponse(correlationId, {
        responderOwnerId: params.responderOwnerId,
        forwardPendingAck: params.forwardPendingAck,
        matches: hopMatches,
      });
      if (updated) {
        await this.publishSessionWithPending(updated);
        if (this.deps.taskStore && params.matches.length > 0) {
          for (const match of hopMatches) {
            await this.deps.taskStore.appendDiscoveryEvent({
              version: "0.1",
              eventId: `discovery_mh2_${randomUUID()}`,
              createdAt: new Date().toISOString(),
              direction: "inbound",
              intent: "discovery.response",
              ownerId: match.ownerId,
              remotePeerId: match.peerId,
              correlationId,
              matchCount: 1,
              requestedTagHashes: match.matchedTagHashes,
              requestedCapabilities: match.matchedCapabilities,
              matchedTagHashes: match.matchedTagHashes,
              matchedCapabilities: match.matchedCapabilities,
              hopDistance: match.hopDistance,
              outcome: "record",
              summary: `Hop-2 discovery match via ${params.responderOwnerId.slice(0, 20)}…`,
            });
          }
        }
      }
    }

    private async notifyDiscoveryForwardPending(input: {
      requesterOwnerId: string;
      requestMessageId: string;
      correlationId: string;
    }): Promise<void> {
      const profile = this.deps.getProfile();
      const mesh = this.deps.getReachableMesh();
      if (!profile || !mesh) return;

      const peerRecord = await this.deps.peerDirectoryStore.getPeerByOwnerId(input.requesterOwnerId);
      if (!peerRecord) return;

      try {
        const transportPeerId = peerRecord.peerId;
        const { recipientEnvelopePeerId } = await this.deps.resolvePeerTransportForOwner(input.requesterOwnerId);
        const dialHints = await this.deps.dialHintsForChat(transportPeerId, peerRecord.listenAddrs ?? []);
        const responsePayload = createDiscoveryResponsePayload({
          requestMessageId: input.requestMessageId,
          responderOwnerId: profile.owner.ownerId,
          matches: [],
          forwardPendingAck: true,
        });
        const unsigned = createUnsignedEnvelope({
          senderPeerId: derivePeerId(profile.device.publicKeyPem),
          senderPublicKey: profile.device.publicKeyPem,
          senderRole: "human",
          recipientPeerId: recipientEnvelopePeerId,
          recipientRole: "human",
          intent: "discovery.response",
          payload: responsePayload,
          correlationId: input.correlationId,
        });
        const envelope = signUnsignedEnvelope(unsigned, profile.device.privateKeyPem);
        await sendEnvelopeWithRetry({
          mesh,
          transportPeerId,
          envelope,
          dialHints,
          peerListenAddrs: peerRecord.listenAddrs,
          rebuildDialHints: () => this.deps.dialHintsForChat(transportPeerId, peerRecord.listenAddrs ?? []),
        });
      } catch (error) {
        console.warn(
          `[discovery_forward] forward-pending ack to ${input.requesterOwnerId} failed:`,
          error instanceof Error ? error.message : error,
        );
      }
    }

    private async relayMultiHopMatchesToRequester(input: {
      requesterOwnerId: string;
      requestMessageId: string;
      correlationId: string;
      hopMatches: MultiHopDiscoveryMatch[];
    }): Promise<void> {
      if (input.hopMatches.length === 0) return;
      const profile = this.deps.requireProfile();
      const mesh = this.deps.requireMesh();
      const peerRecord = await this.deps.peerDirectoryStore.getPeerByOwnerId(input.requesterOwnerId);
      if (!peerRecord) return;

      try {
        const transportPeerId = peerRecord.peerId;
        const { recipientEnvelopePeerId } = await this.deps.resolvePeerTransportForOwner(input.requesterOwnerId);
        const dialHints = await this.deps.dialHintsForChat(transportPeerId, peerRecord.listenAddrs ?? []);
        const responsePayload = createDiscoveryResponsePayload({
          requestMessageId: input.requestMessageId,
          responderOwnerId: profile.owner.ownerId,
          matches: input.hopMatches.map((match) => ({
            ownerId: match.ownerId,
            peerId: match.peerId,
            matchedCapabilities: match.matchedCapabilities,
            matchedTagHashes: match.matchedTagHashes,
            hopDistance: match.hopDistance,
          })),
          truncated: false,
        });
        const unsigned = createUnsignedEnvelope({
          senderPeerId: derivePeerId(profile.device.publicKeyPem),
          senderPublicKey: profile.device.publicKeyPem,
          senderRole: "human",
          recipientPeerId: recipientEnvelopePeerId,
          recipientRole: "human",
          intent: "discovery.response",
          payload: responsePayload,
          correlationId: input.correlationId,
        });
        const envelope = signUnsignedEnvelope(unsigned, profile.device.privateKeyPem);
        await sendEnvelopeWithRetry({
          mesh,
          transportPeerId,
          envelope,
          dialHints,
          peerListenAddrs: peerRecord.listenAddrs,
          rebuildDialHints: () => this.deps.dialHintsForChat(transportPeerId, peerRecord.listenAddrs ?? []),
        });
        if (this.deps.taskStore) {
          await this.deps.taskStore.appendAuditEvent(
            createAuditEvent({
              type: "p2p.trace",
              direction: "outbound",
              protocol: "discovery.forward.relay.ok",
              outcome: "record",
              correlationId: input.correlationId,
              remotePeerId: transportPeerId,
              summary: `Relayed ${input.hopMatches.length} hop-2 match(es) to ${input.requesterOwnerId.slice(0, 24)}…`,
            }),
          );
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (this.deps.taskStore) {
          await this.deps.taskStore.appendAuditEvent(
            createAuditEvent({
              type: "p2p.trace",
              direction: "outbound",
              protocol: "discovery.forward.relay.fail",
              outcome: "deny",
              correlationId: input.correlationId,
              summary: `Hop-2 relay to ${input.requesterOwnerId.slice(0, 24)}… failed: ${message}`,
            }),
          );
        }
        console.warn(
          `[discovery_forward] relay hop-2 matches to ${input.requesterOwnerId} failed:`,
          message,
        );
      }
    }

    async requestMultiHopDiscovery(
      params: RequestMultiHopDiscoveryParams,
    ): Promise<RequestMultiHopDiscoveryResult> {
      const profile = this.deps.requireProfile();
      const mesh = this.deps.requireMesh();
      const correlationId = randomUUID();
      const maxHops = Math.min(params.maxHops ?? 2, 4);
      const maxBonds = params.maxBonds ?? 5;
      const trustRecords = await this.deps.trustStore.listTrustRecords();
      const bonds = trustRecords.filter((row) => row.level !== "blocked").slice(0, maxBonds);
      const matches: MultiHopDiscoveryMatch[] = [];
      const seenOwners = new Set<string>();

      for (const bond of bonds) {
        const peerRecord = await this.deps.peerDirectoryStore.getPeerByOwnerId(bond.peerOwnerId);
        if (!peerRecord) continue;
        try {
          const transportPeerId = peerRecord.peerId;
          const { recipientEnvelopePeerId } = await this.deps.resolvePeerTransportForOwner(bond.peerOwnerId);
          const dialHints = await this.deps.dialHintsForChat(transportPeerId, peerRecord.listenAddrs ?? []);
          const unsigned = createUnsignedEnvelope({
            senderPeerId: derivePeerId(profile.device.publicKeyPem),
            senderPublicKey: profile.device.publicKeyPem,
            senderRole: "human",
            recipientPeerId: recipientEnvelopePeerId,
            recipientRole: "human",
            intent: "discovery.request",
            payload: createDiscoveryRequestPayload({
              requesterOwnerId: profile.owner.ownerId,
              requestedTagHashes: params.requestedTagHashes ?? [],
              requestedCapabilities: params.requestedCapabilities ?? [],
              fileTitleQuery: params.fileTitleQuery,
              maxResults: 8,
              requestedSensitivity: "public",
              maxHops,
              currentHop: 0,
            }),
            correlationId,
          });
          const envelope = signUnsignedEnvelope(unsigned, profile.device.privateKeyPem);
          const reply = await sendExpectReplyWithRetry({
            mesh,
            transportPeerId,
            envelope,
            dialHints,
            timeoutMs: 18_000,
          });
          if (reply.intent !== "discovery.response") continue;
          const resp = parseDiscoveryResponsePayload(reply.payload);
          for (const match of resp.matches) {
            if (seenOwners.has(match.ownerId)) continue;
            seenOwners.add(match.ownerId);
            const bondLabel = bond.displayName ?? bond.peerOwnerId;
            matches.push({
              ownerId: match.ownerId,
              peerId: match.peerId,
              hopDistance: match.hopDistance ?? 1,
              matchedCapabilities: match.matchedCapabilities,
              matchedTagHashes: match.matchedTagHashes,
              viaOwnerId: bond.peerOwnerId,
              viaDisplayName: bondLabel,
              trustPath: `${profile.owner.ownerId} → ${bond.peerOwnerId} → ${match.ownerId}`,
            });
          }
          if (this.deps.taskStore) {
            await this.deps.taskStore.appendDiscoveryEvent({
              version: "0.1",
              eventId: `discovery_mh_${envelope.messageId}`,
              createdAt: new Date().toISOString(),
              direction: "outbound",
              intent: "discovery.response",
              ownerId: bond.peerOwnerId,
              remotePeerId: transportPeerId,
              correlationId,
              requestMessageId: envelope.messageId,
              matchCount: resp.matches.length,
              requestedTagHashes: params.requestedTagHashes ?? [],
              requestedCapabilities: params.requestedCapabilities ?? [],
              matchedTagHashes: resp.matches.flatMap((m) => m.matchedTagHashes),
              matchedCapabilities: resp.matches.flatMap((m) => m.matchedCapabilities),
              trustLevel: bond.level,
              hopDistance: resp.matches[0]?.hopDistance ?? 1,
              outcome: "record",
              summary: `Multi-hop discovery bond query returned ${resp.matches.length} match(es).`,
            });
          }
        } catch (error) {
          console.warn(
            `[requestMultiHopDiscovery] bond ${bond.peerOwnerId} failed:`,
            error instanceof Error ? error.message : error,
          );
        }
      }

      if (this.deps.taskStore) {
        await this.deps.taskStore.appendAuditEvent(
          createAuditEvent({
            type: "p2p.trace",
            direction: "outbound",
            protocol: "discovery.multihop.ok",
            outcome: "record",
            correlationId,
            summary: `requestMultiHopDiscovery bonds=${bonds.length} matches=${matches.length} maxHops=${maxHops}`,
          }),
        );
      }

      const pendingForwardApprovals = maxHops >= 2 ? bonds.length : 0;
      const awaitingHop2ViaBonds = maxHops >= 2 ? bonds.map((bond) => bond.peerOwnerId) : [];
      const now = new Date().toISOString();
      if (this.deps.multihopDiscoveryStore) {
        const session: MultiHopDiscoverySessionView = {
          correlationId,
          createdAt: now,
          updatedAt: now,
          bondsQueried: bonds.length,
          pendingForwardApprovals,
          awaitingHop2ViaBonds,
          matches,
        };
        await this.deps.multihopDiscoveryStore.upsertSession({
          ...session,
          awaitingHop2ViaBonds,
        });
        await this.publishMultiHopSession(session);
      }

      return {
        matches,
        bondsQueried: bonds.length,
        correlationId,
        pendingForwardApprovals,
        aggregatedMatchCount: matches.length,
      };
    }

    async executeDiscoveryForward(
      payload: DiscoveryForwardApprovalPayload,
    ): Promise<{ ok: boolean; error?: string }> {
      const profile = this.deps.requireProfile();
      const mesh = this.deps.requireMesh();
      const trustRecords = await this.deps.trustStore.listTrustRecords();
      const exclude = new Set(payload.excludeOwnerIds);
      exclude.add(payload.requesterOwnerId);
      const bonds = trustRecords.filter(
        (row) => row.level !== "blocked" && !exclude.has(row.peerOwnerId),
      );
      if (bonds.length === 0) {
        return { ok: false, error: "no forward bonds available" };
      }

      const forwardBase = buildForwardedDiscoveryPayload(
        createDiscoveryRequestPayload({
          requesterOwnerId: payload.requesterOwnerId,
          requestedTagHashes: payload.requestedTagHashes,
          requestedCapabilities: payload.requestedCapabilities,
          maxHops: payload.maxHops,
          currentHop: payload.currentHop,
        }),
        payload.requesterOwnerId,
        profile.owner.ownerId,
        payload.correlationId,
      );
      const forwardPayload = createDiscoveryRequestPayload({
        ...forwardBase,
        referralAttestation: createDiscoveryReferralAttestation(
          {
            referralOwnerId: profile.owner.ownerId,
            requestMessageId: payload.requestMessageId,
            correlationId: payload.correlationId,
            anonymizedRequesterId: forwardBase.requesterOwnerId,
          },
          profile.owner.privateKeyPem,
        ),
      });

      let forwarded = 0;
      for (const bond of bonds.slice(0, 8)) {
        const peerRecord = await this.deps.peerDirectoryStore.getPeerByOwnerId(bond.peerOwnerId);
        if (!peerRecord) continue;
        try {
          const transportPeerId = peerRecord.peerId;
          const { recipientEnvelopePeerId } = await this.deps.resolvePeerTransportForOwner(bond.peerOwnerId);
          const dialHints = await this.deps.dialHintsForChat(transportPeerId, peerRecord.listenAddrs ?? []);
          const unsigned = createUnsignedEnvelope({
            senderPeerId: derivePeerId(profile.device.publicKeyPem),
            senderPublicKey: profile.device.publicKeyPem,
            senderRole: "human",
            recipientPeerId: recipientEnvelopePeerId,
            recipientRole: "human",
            intent: "discovery.request",
            payload: forwardPayload,
            correlationId: payload.correlationId,
          });
          const envelope = signUnsignedEnvelope(unsigned, profile.device.privateKeyPem);
          const reply = await sendExpectReplyWithRetry({
            mesh,
            transportPeerId,
            envelope,
            dialHints,
            timeoutMs: 18_000,
          });
          forwarded += 1;
          if (this.deps.taskStore) {
            const replyIntent = reply.intent;
            const replyMatches =
              reply.intent === "discovery.response"
                ? parseDiscoveryResponsePayload(reply.payload).matches.length
                : 0;
            await this.deps.taskStore.appendAuditEvent(
              createAuditEvent({
                type: "p2p.trace",
                direction: "outbound",
                protocol: "discovery.forward.reply",
                outcome: "record",
                correlationId: payload.correlationId,
                summary: `Forward reply intent=${replyIntent} matches=${replyMatches} bond=${bond.peerOwnerId.slice(0, 20)}…`,
              }),
            );
          }
          if (reply.intent === "discovery.response" && payload.correlationId) {
            const resp = parseDiscoveryResponsePayload(reply.payload);
            const bondLabel = bond.displayName ?? bond.peerOwnerId;
            const hopMatches: MultiHopDiscoveryMatch[] = resp.matches.map((match) => ({
              ownerId: match.ownerId,
              peerId: match.peerId,
              hopDistance: match.hopDistance ?? forwardPayload.currentHop + 1,
              matchedCapabilities: match.matchedCapabilities,
              matchedTagHashes: match.matchedTagHashes,
              viaOwnerId: bond.peerOwnerId,
              viaDisplayName: bondLabel,
              referralOwnerId: profile.owner.ownerId,
              trustPath: `${profile.owner.ownerId} → ${bond.peerOwnerId} → ${match.ownerId}`,
            }));
            await this.relayMultiHopMatchesToRequester({
              requesterOwnerId: payload.requesterOwnerId,
              requestMessageId: payload.requestMessageId,
              correlationId: payload.correlationId,
              hopMatches,
            });
          }
        } catch (error) {
          console.warn(
            `[discovery_forward] bond ${bond.peerOwnerId} failed:`,
            error instanceof Error ? error.message : error,
          );
        }
      }

      if (this.deps.taskStore) {
        await this.deps.taskStore.appendAuditEvent(
          createAuditEvent({
            type: "p2p.trace",
            direction: "outbound",
            protocol: "discovery.forward.ok",
            outcome: "record",
            correlationId: payload.correlationId,
            summary: `Forwarded discovery.request hop=${forwardPayload.currentHop} bonds=${forwarded}`,
          }),
        );
      }

      return forwarded > 0 ? { ok: true } : { ok: false, error: "all forward sends failed" };
    }

    private async warmLocalPeerProfilesForSearch(query: SearchQuery, maxResults: number): Promise<void> {
      if (!this.deps.warmLocalPeerProfiles || !this.deps.peerProfileCacheStore) return;
      const hasTextQuery =
        Boolean(query.queryText?.trim()) ||
        Boolean(query.username?.trim()) ||
        Boolean(query.interests && query.interests.length > 0);
      if (!hasTextQuery) return;

      const selfOwnerId = this.deps.getProfile()?.owner.ownerId;
      const [peerRecords, cached] = await Promise.all([
        this.deps.peerDirectoryStore.listPeerRecords(),
        this.deps.peerProfileCacheStore.list(),
      ]);
      const cachedOwners = new Set(cached.map((row) => row.ownerId));
      const missingOwnerIds = peerRecords
        .map((row) => row.ownerId)
        .filter((ownerId) => ownerId !== selfOwnerId && !cachedOwners.has(ownerId))
        .slice(0, Math.min(6, maxResults));
      if (missingOwnerIds.length === 0) return;
      await this.deps.warmLocalPeerProfiles(missingOwnerIds);
    }

    private async searchLocalPeers(query: SearchQuery, maxResults: number): Promise<PeerSearchResult[]> {
      const peerRecords = await this.deps.peerDirectoryStore.listPeerRecords();
      const trustRecords = await this.deps.trustStore.listTrustRecords();

      // Bundled sponsor fallback: the DMG ships a `bundled-sponsor-friend.json`
      // whose `contactUri` carries `displayName`, `ownerId`, and `peerId`. On
      // a fresh install (no bond, no inbound profile sync, no DHT), the local
      // peer directory record for the sponsor has an empty `listenAddrs` and
      // no displayName. The bundled `displayName` is the only name we have
      // until the bond completes. Read it once per search and use it as a
      // fallback when the trust store + peer profile cache have no name for
      // the matching owner.
      let bundledSponsorIdentity:
        | { ownerId: string; peerId: string; displayName: string }
        | undefined;
      if (this.deps.getBundledSponsorIdentity) {
        try {
          bundledSponsorIdentity = await this.deps.getBundledSponsorIdentity();
        } catch {
          bundledSponsorIdentity = undefined;
        }
      }

      const profileByOwner = new Map<string, HumanProfilePayload>();
      if (this.deps.peerProfileCacheStore) {
        const cached = await this.deps.peerProfileCacheStore.list();
        for (const row of cached) {
          profileByOwner.set(row.ownerId, row.profile);
        }
      }

      // Build a map of ownerId -> displayName from trust records, with the
      // bundled sponsor's displayName as a last-resort fallback. Without
      // this, a never-bonded sponsor has no name in any local source and
      // the search can't match their bundled display name.
      const displayNameByOwner = new Map<string, string>();
      for (const record of trustRecords) {
        if (record.displayName) {
          displayNameByOwner.set(record.peerOwnerId, record.displayName);
        }
      }
      if (
        bundledSponsorIdentity
        && !displayNameByOwner.has(bundledSponsorIdentity.ownerId)
      ) {
        displayNameByOwner.set(
          bundledSponsorIdentity.ownerId,
          bundledSponsorIdentity.displayName,
        );
      }

      // Get bonded peers (trust level exists and is not "blocked")
      const bondedOwnerIds = new Set<string>();
      for (const record of trustRecords) {
        if (record.level !== "blocked") {
          bondedOwnerIds.add(record.peerOwnerId);
        }
      }

      let results: PeerSearchResult[] = [];

      const matchesLocalQuery = (ownerId: string, displayName: string, peerId: string): boolean => {
        const profile = profileByOwner.get(ownerId);
        const username = profile?.username?.toLowerCase() ?? "";
        const profileName = profile?.displayName?.toLowerCase() ?? "";
        const hobbyHaystack = [...(profile?.hobbies ?? []), ...(profile?.knowledge ?? [])].map((h) =>
          h.toLowerCase(),
        );

        if (query.queryText) {
          const q = query.queryText.toLowerCase();
          if (
            ownerId.toLowerCase().includes(q) ||
            displayName.toLowerCase().includes(q) ||
            profileName.includes(q) ||
            username.includes(q)
          ) {
            return true;
          }
        }

        if (query.username) {
          const u = query.username.toLowerCase();
          if (
            username === u ||
            displayName.toLowerCase().includes(u) ||
            ownerId.toLowerCase().includes(u) ||
            profileName.includes(u)
          ) {
            return true;
          }
        }

        if (query.interests && query.interests.length > 0) {
          const needles = query.interests.map((i) => i.toLowerCase());
          const haystack = [
            ownerId,
            displayName,
            profileName,
            username,
            peerId,
            ...hobbyHaystack,
          ].filter(Boolean);
          if (needles.some((needle) => haystack.some((h) => h.includes(needle) || needle.includes(h)))) {
            return true;
          }
        }

        return false;
      };

      const pushResult = (record: (typeof peerRecords)[number], displayName: string) => {
        const profile = profileByOwner.get(record.ownerId);
        const interests = [...(profile?.hobbies ?? []), ...(profile?.knowledge ?? [])];
        if (!results.some((r) => r.nodeId === record.peerId)) {
          results.push({
            nodeId: record.peerId,
            ownerId: record.ownerId,
            displayName: profile?.displayName ?? displayName,
            interests,
            profileVisibility: profile?.profileVisibility ?? "public",
            username: profile?.username,
            discoverySource: "local",
          });
        }
      };

      // Build results from peer records.
      // With a text query, only matching peers (bonded or not) are returned.
      // Without a text query, return bonded peers + a sample of unbonded
      // directory peers (up to half the maxResults budget) so the user
      // always has a browsable list when search returns no text matches.
      // Blocked peers are NEVER returned (Phase 9 trust policy).
      const blockedOwnerIds = new Set<string>();
      for (const record of trustRecords) {
        if (record.level === "blocked") {
          blockedOwnerIds.add(record.peerOwnerId);
        }
      }
      const unbondedSampleLimit = Math.max(1, Math.floor(maxResults / 2));
      let unbondedSampled = 0;
      for (const record of peerRecords) {
        const displayName = displayNameByOwner.get(record.ownerId) ?? record.ownerId;
        if (blockedOwnerIds.has(record.ownerId)) {
          continue; // never surface blocked peers
        }
        const isBonded = bondedOwnerIds.has(record.ownerId);
        const hasTextQuery =
          Boolean(query.queryText?.trim()) ||
          Boolean(query.username?.trim()) ||
          Boolean(query.interests && query.interests.length > 0);

        if (hasTextQuery) {
          if (matchesLocalQuery(record.ownerId, displayName, record.peerId)) {
            pushResult(record, displayName);
          }
          continue;
        }

        if (isBonded) {
          pushResult(record, displayName);
        } else if (unbondedSampled < unbondedSampleLimit) {
          pushResult(record, displayName);
          unbondedSampled += 1;
        }
      }

      return results.slice(0, maxResults);
    }

    /**
     * Search for peers via rendezvous servers (relay-based discovery)
     */
    private async searchByRendezvous(interests: string[]): Promise<PeerSearchResult[]> {
      const config = await this.deps.configStore.load();
      if (!config?.configuredRelays || config.configuredRelays.length === 0) {
        return [];
      }

      const mesh = this.deps.requireMesh();
      const selfProfile = this.deps.requireProfile();
      const results: PeerSearchResult[] = [];

      for (const relay of config.configuredRelays) {
        if (!relay.enabled) continue;

        try {
          // Normalize raw interests to the canonical `interest:<slug>` tag
          // vocabulary. Rendezvous registers advertise under the same form
          // (see _registerWithRendezvousServers, which receives interests
          // from computePublicDiscoveryTopics — already `interest:<slug>`).
          // Filtering empties guards against user-entered junk interests.
          const normalizedTags = interests
            .map((interest) => interestTopicFor(interest))
            .filter(Boolean);
          if (normalizedTags.length === 0) continue;

          console.log(`[node-service] Searching rendezvous server ${relay.addr} for tags: ${normalizedTags.join(", ")}`);

          const queryPayload = {
            match: normalizedTags.map((tag) => ({ tag })) as any,
          };

          const envelope = signUnsignedEnvelope(
            createUnsignedEnvelope({
              senderPeerId: mesh.peerId,
              senderPublicKey: selfProfile.device.publicKeyPem,
              recipientPeerId: relay.addr,
              intent: "rendezvous.query",
              payload: queryPayload,
            }),
            selfProfile.device.privateKeyPem,
          );

          const response = await sendExpectReplyWithRetry({
            mesh,
            transportPeerId: relay.addr,
            envelope,
            dialHints: [relay.addr.startsWith("/") ? relay.addr : `/p2p/${relay.addr}`],
            timeoutMs: 15_000,
          });
          const responsePayload = RendezvousResponsePayloadSchema.parse(response.payload);

          console.log(`[node-service] Rendezvous query returned ${responsePayload.matches.length} matches from ${relay.addr}`);

          for (const match of responsePayload.matches) {
            results.push({
              nodeId: match.peerId,
              ownerId: match.peerId,
              displayName: match.peerId.slice(0, 12) + "...",
              interests: match.capabilities?.map((c: any) => ("tag" in c ? c.tag : "")).filter(Boolean) ?? [],
              profileVisibility: "public",
            });
          }
        } catch (err) {
          console.warn(`[node-service] Rendezvous query failed for ${relay.addr}:`, err);
        }
      }

      return results;
    }

    async advertiseTopic(topic: string): Promise<void> {
      const mesh = this.deps.getMesh();
      if (!mesh) {
        throw new Error("Node not initialized");
      }
      try {
        console.log(`[node-service] Advertising topic: "${topic}" on DHT`);
        // provideCapabilityTopic returns { timedOut } so we can log
        // accurately. Previously the function swallowed the timeout and
        // we logged "Successfully advertised" even when nothing landed.
        const result = await mesh.provideCapabilityTopic(topic);
        if (result.timedOut) {
          console.warn(
            `[node-service] advertiseTopic "${topic}" TIMED OUT — ` +
            `DHT likely has no reachable peers. Topic will be re-advertised on next cycle.`,
          );
        } else {
          console.log(`[node-service] Successfully advertised topic: ${topic}`);
        }
      } catch (err) {
        console.error(`[node-service] Failed to advertise topic ${topic}:`, err);
        throw err;
      }
    }

    async stopAdvertiseTopic(topic: string): Promise<void> {
      const mesh = this.deps.getMesh();
      if (!mesh) {
        throw new Error("Node not initialized");
      }
      try {
        await mesh.cancelCapabilityTopicReprovide(topic);
        console.log(`[node-service] Stopped advertising topic: ${topic}`);
      } catch (err) {
        console.error(`[node-service] Failed to stop advertising topic ${topic}:`, err);
        throw err;
      }
    }
}
