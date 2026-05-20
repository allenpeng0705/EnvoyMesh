import { describe, expect, it, beforeEach } from "vitest";
import {
  createMobilePeerDirectory,
  createMobileTrustStore,
  createMobileSessionTokenStore,
  createMobileChatLogStore,
  createMobileIdentityStateStore,
  mobileStorageSchema,
  createInMemoryDb,
  type MobileDatabase,
  type MobilePeerDirectory,
  type MobileTrustStore,
  type MobileSessionTokenStore,
  type MobileChatLogStore,
  type MobileIdentityStateStore,
  type ChatLogEntry,
  type PersistedIdentityState,
} from "../src/index.js";
import type { BondRecord } from "@envoymesh/api";
import type { SessionTokenRecord } from "../src/session-token-types.js";

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

describe("mobile-storage", () => {
  let db: MobileDatabase;
  let peerDirectory: MobilePeerDirectory;
  let trustStore: MobileTrustStore;
  let sessionTokenStore: MobileSessionTokenStore;
  let chatLogStore: MobileChatLogStore;
  let identityStateStore: MobileIdentityStateStore;

  beforeEach(() => {
    db = createInMemoryDb();
    peerDirectory = createMobilePeerDirectory(db);
    trustStore = createMobileTrustStore(db);
    sessionTokenStore = createMobileSessionTokenStore(db);
    chatLogStore = createMobileChatLogStore(db);
    identityStateStore = createMobileIdentityStateStore(db);
  });

  // -----------------------------------------------------------------------
  // Peer directory tests
  // -----------------------------------------------------------------------

  describe("peer directory", () => {
    it("returns undefined for unknown peer", async () => {
      const entry = await peerDirectory.get("unknown");
      expect(entry).toBeUndefined();
    });

    it("stores and retrieves a peer", async () => {
      const entry = {
        ownerId: "envoy:owner:abc123",
        multiaddrs: ["/ip4/1.2.3.4/tcp/4001"],
        lastSeen: "2026-05-17T10:00:00.000Z",
      };
      await peerDirectory.set(entry);

      const retrieved = await peerDirectory.get(entry.ownerId);
      expect(retrieved).toEqual(entry);
    });

    it("updates an existing peer", async () => {
      const entry = {
        ownerId: "envoy:owner:abc123",
        multiaddrs: ["/ip4/1.2.3.4/tcp/4001"],
        lastSeen: "2026-05-17T10:00:00.000Z",
      };
      await peerDirectory.set(entry);

      const updated = {
        ...entry,
        multiaddrs: ["/ip4/5.6.7.8/tcp/4001", "/ip4/1.2.3.4/tcp/4001"],
        lastSeen: "2026-05-17T11:00:00.000Z",
      };
      await peerDirectory.set(updated);

      const retrieved = await peerDirectory.get(entry.ownerId);
      expect(retrieved).toEqual(updated);
    });

    it("deletes a peer", async () => {
      const entry = {
        ownerId: "envoy:owner:abc123",
        multiaddrs: ["/ip4/1.2.3.4/tcp/4001"],
        lastSeen: "2026-05-17T10:00:00.000Z",
      };
      await peerDirectory.set(entry);
      await peerDirectory.delete(entry.ownerId);

      const retrieved = await peerDirectory.get(entry.ownerId);
      expect(retrieved).toBeUndefined();
    });

    it("stores and retrieves libp2pPeerId for routing", async () => {
      const entry = {
        ownerId: "envoy:owner:withpeer",
        multiaddrs: [],
        lastSeen: "2026-05-17T10:00:00.000Z",
        libp2pPeerId: "12D3KooWAbcd",
      };
      await peerDirectory.set(entry);
      const retrieved = await peerDirectory.get(entry.ownerId);
      expect(retrieved).toEqual(entry);
    });

    it("lists all peers", async () => {
      const e1 = { ownerId: "a", multiaddrs: ["/ip4/1.1.1.1/tcp/1"], lastSeen: "2026-01-01T00:00:00.000Z" };
      const e2 = { ownerId: "b", multiaddrs: ["/ip4/2.2.2.2/tcp/2"], lastSeen: "2026-01-02T00:00:00.000Z" };
      await peerDirectory.set(e1);
      await peerDirectory.set(e2);

      const list = await peerDirectory.list();
      expect(list).toHaveLength(2);
      expect(list).toEqual(expect.arrayContaining([e1, e2]));
    });

    it("handles empty multiaddr gracefully", async () => {
      const entry = {
        ownerId: "envoy:owner:empty",
        multiaddrs: [],
        lastSeen: "2026-05-17T10:00:00.000Z",
      };
      await peerDirectory.set(entry);

      const retrieved = await peerDirectory.get(entry.ownerId);
      expect(retrieved?.multiaddrs).toEqual([]);
    });
  });

  // -----------------------------------------------------------------------
  // Trust store tests
  // -----------------------------------------------------------------------

  describe("trust store", () => {
    const makeBond = (overrides: Partial<BondRecord> = {}): BondRecord => ({
      peerOwnerId: "envoy:owner:peer1",
      level: "public",
      createdAt: "2026-05-17T10:00:00.000Z",
      ...overrides,
    });

    it("returns undefined for unknown bond", async () => {
      const bond = await trustStore.get("unknown");
      expect(bond).toBeUndefined();
    });

    it("stores and retrieves a bond", async () => {
      const bond = makeBond();
      await trustStore.set(bond);

      const retrieved = await trustStore.get(bond.peerOwnerId);
      expect(retrieved).toEqual(bond);
    });

    it("updates an existing bond", async () => {
      const bond = makeBond();
      await trustStore.set(bond);

      const updated = makeBond({ level: "direct", displayName: "Alice" });
      await trustStore.set(updated);

      const retrieved = await trustStore.get(bond.peerOwnerId);
      expect(retrieved?.level).toBe("direct");
      expect(retrieved?.displayName).toBe("Alice");
    });

    it("deletes a bond", async () => {
      const bond = makeBond();
      await trustStore.set(bond);
      await trustStore.delete(bond.peerOwnerId);

      const retrieved = await trustStore.get(bond.peerOwnerId);
      expect(retrieved).toBeUndefined();
    });

    it("lists all bonds", async () => {
      const b1 = makeBond({ peerOwnerId: "envoy:owner:a" });
      const b2 = makeBond({ peerOwnerId: "envoy:owner:b", level: "referred" });
      await trustStore.set(b1);
      await trustStore.set(b2);

      const list = await trustStore.list();
      expect(list).toHaveLength(2);
    });

    it("handles bond with optional fields", async () => {
      const bond = makeBond({
        displayName: "Bob",
        libp2pPeerId: "12D3KooW...",
        note: "Met at conference",
      });
      await trustStore.set(bond);

      const retrieved = await trustStore.get(bond.peerOwnerId);
      expect(retrieved?.displayName).toBe("Bob");
      expect(retrieved?.libp2pPeerId).toBe("12D3KooW...");
      expect(retrieved?.note).toBe("Met at conference");
    });

    it("handles bond without optional fields", async () => {
      const bond = makeBond();
      delete bond.displayName;
      delete bond.libp2pPeerId;
      delete bond.note;
      await trustStore.set(bond);

      const retrieved = await trustStore.get(bond.peerOwnerId);
      expect(retrieved?.displayName).toBeUndefined();
      expect(retrieved?.libp2pPeerId).toBeUndefined();
      expect(retrieved?.note).toBeUndefined();
    });
  });

  // -----------------------------------------------------------------------
  // Session token store tests
  // -----------------------------------------------------------------------

  describe("session token store", () => {
    const makeToken = (overrides: Partial<SessionTokenRecord> = {}): SessionTokenRecord => ({
      token: "tok-12345",
      ownerId: "envoy:owner:test",
      deviceId: "envoy:device:test",
      displayName: "iPhone",
      createdAt: "2026-05-17T10:00:00.000Z",
      lastUsedAt: "2026-05-17T10:00:00.000Z",
      ...overrides,
    });

    it("returns undefined for unknown token", async () => {
      const tok = await sessionTokenStore.getTokenByValue("unknown");
      expect(tok).toBeUndefined();
    });

    it("returns undefined for empty token", async () => {
      const tok = await sessionTokenStore.getTokenByValue("");
      expect(tok).toBeUndefined();
    });

    it("stores and retrieves a token", async () => {
      const tok = makeToken();
      await sessionTokenStore.setToken(tok);

      const retrieved = await sessionTokenStore.getTokenByValue(tok.token);
      expect(retrieved).toEqual(tok);
    });

    it("replaces token for same owner", async () => {
      const tok1 = makeToken({ token: "tok-old" });
      const tok2 = makeToken({ token: "tok-new" });
      await sessionTokenStore.setToken(tok1);
      await sessionTokenStore.setToken(tok2);

      // Old token should be gone
      const old = await sessionTokenStore.getTokenByValue("tok-old");
      expect(old).toBeUndefined();

      // New token should exist
      const current = await sessionTokenStore.getTokenByValue("tok-new");
      expect(current).toEqual(tok2);
    });

    it("lists all tokens", async () => {
      const t1 = makeToken({ token: "tok-a", ownerId: "owner-a" });
      const t2 = makeToken({ token: "tok-b", ownerId: "owner-b" });
      await sessionTokenStore.setToken(t1);
      await sessionTokenStore.setToken(t2);

      const list = await sessionTokenStore.listTokens();
      expect(list).toHaveLength(2);
    });

    it("removes all tokens for an owner", async () => {
      const t1 = makeToken({ token: "tok-a", ownerId: "owner-a" });
      const t2 = makeToken({ token: "tok-b", ownerId: "owner-b" });
      await sessionTokenStore.setToken(t1);
      await sessionTokenStore.setToken(t2);

      await sessionTokenStore.removeTokensForOwner("owner-a");

      const list = await sessionTokenStore.listTokens();
      expect(list).toHaveLength(1);
      expect(list[0].ownerId).toBe("owner-b");
    });
  });

  // -----------------------------------------------------------------------
  // Chat log store tests
  // -----------------------------------------------------------------------

  describe("chat log store", () => {
    function makeEntry(overrides: Partial<ChatLogEntry> = {}): ChatLogEntry {
      return {
        messageId: "msg-1",
        sender: { ownerId: "envoy:owner:a", displayName: "Alice" },
        recipient: { ownerId: "envoy:owner:b", displayName: "Bob" },
        content: { text: "Hello!" },
        metadata: { timestamp: "2026-05-17T10:00:00.000Z", deliveryReceipt: "sent" },
        signature: "sig-abc",
        ...overrides,
      };
    }

    it("listThread returns empty for unknown peer", async () => {
      const list = await chatLogStore.listThread("unknown");
      expect(list).toEqual([]);
    });

    it("append and listThread round-trips a single message", async () => {
      const entry = makeEntry();
      await chatLogStore.append("envoy:owner:b", entry);

      const list = await chatLogStore.listThread("envoy:owner:b");
      expect(list).toHaveLength(1);
      expect(list[0].messageId).toBe("msg-1");
      expect(list[0].content.text).toBe("Hello!");
      expect(list[0].sender.ownerId).toBe("envoy:owner:a");
    });

    it("listThread returns messages in ascending timestamp order", async () => {
      const e1 = makeEntry({ messageId: "m1", metadata: { timestamp: "2026-01-01T00:00:00.000Z" } });
      const e2 = makeEntry({ messageId: "m2", metadata: { timestamp: "2026-06-01T00:00:00.000Z" } });
      const e3 = makeEntry({ messageId: "m3", metadata: { timestamp: "2026-03-01T00:00:00.000Z" } });
      await chatLogStore.append("thread-x", e1);
      await chatLogStore.append("thread-x", e2);
      await chatLogStore.append("thread-x", e3);

      const list = await chatLogStore.listThread("thread-x");
      expect(list).toHaveLength(3);
      expect(list[0].messageId).toBe("m1"); // oldest
      expect(list[2].messageId).toBe("m2"); // newest
    });

    it("listThread filters by threadPeerOwnerId", async () => {
      await chatLogStore.append("peer-a", makeEntry({ messageId: "a1" }));
      await chatLogStore.append("peer-b", makeEntry({ messageId: "b1" }));

      const listA = await chatLogStore.listThread("peer-a");
      expect(listA).toHaveLength(1);
      expect(listA[0].messageId).toBe("a1");

      const listB = await chatLogStore.listThread("peer-b");
      expect(listB).toHaveLength(1);
      expect(listB[0].messageId).toBe("b1");
    });

    it("listThread respects limit parameter", async () => {
      for (let i = 0; i < 5; i++) {
        await chatLogStore.append("peer-x", makeEntry({ messageId: `msg-${i}`,
          metadata: { timestamp: `2026-01-0${i + 1}T00:00:00.000Z` } }));
      }

      const list = await chatLogStore.listThread("peer-x", 3);
      expect(list).toHaveLength(3);
      expect(list[0].messageId).toBe("msg-0");
      expect(list[2].messageId).toBe("msg-2");
    });
  });

  // -----------------------------------------------------------------------
  // Identity state store tests
  // -----------------------------------------------------------------------

  describe("identity state store", () => {
    function makeState(overrides: Partial<PersistedIdentityState> = {}): PersistedIdentityState {
      return {
        sharedIdentity: true,
        ownerId: "envoy:owner:abc",
        ownerPublicKeyPem: "-----BEGIN PUBLIC KEY-----\nMCow...\n-----END PUBLIC KEY-----",
        deviceId: "envoy:device:xyz",
        devicePublicKeyPem: "-----BEGIN PUBLIC KEY-----\nMCow...\n-----END PUBLIC KEY-----",
        agentPeerId: "envoy_agent_hash123",
        agentPublicKeyPem: "-----BEGIN PUBLIC KEY-----\nMCow...\n-----END PUBLIC KEY-----",
        homeNodePeerId: "home-peer-id",
        relayUrls: ["ws://relay.example.com:9000"],
        createdAt: "2026-05-17T10:00:00.000Z",
        updatedAt: "2026-05-17T10:00:00.000Z",
        ...overrides,
      };
    }

    it("load returns undefined when no state saved", async () => {
      const state = await identityStateStore.load();
      expect(state).toBeUndefined();
    });

    it("save and load round-trips identity state", async () => {
      const state = makeState();
      await identityStateStore.save(state);

      const loaded = await identityStateStore.load();
      expect(loaded).toBeDefined();
      expect(loaded!.sharedIdentity).toBe(true);
      expect(loaded!.ownerId).toBe("envoy:owner:abc");
      expect(loaded!.deviceId).toBe("envoy:device:xyz");
      expect(loaded!.agentPeerId).toBe("envoy_agent_hash123");
      expect(loaded!.homeNodePeerId).toBe("home-peer-id");
      expect(loaded!.relayUrls).toEqual(["ws://relay.example.com:9000"]);
    });

    it("save overwrites previous state", async () => {
      const s1 = makeState({ ownerId: "envoy:owner:first" });
      await identityStateStore.save(s1);

      const s2 = makeState({ ownerId: "envoy:owner:second" });
      await identityStateStore.save(s2);

      const loaded = await identityStateStore.load();
      expect(loaded!.ownerId).toBe("envoy:owner:second");
    });

    it("clear removes persisted state", async () => {
      await identityStateStore.save(makeState());
      const before = await identityStateStore.load();
      expect(before).toBeDefined();

      await identityStateStore.clear();
      const after = await identityStateStore.load();
      expect(after).toBeUndefined();
    });

    it("round-trips optional fields", async () => {
      const state = makeState({
        homeAgentPeerId: "home-agent-peer-id",
        homeAgentPubKey: "-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----",
        deviceCertificateJson: '{"cert":"data"}',
        sessionToken: "tok-session-123",
      });
      await identityStateStore.save(state);

      const loaded = await identityStateStore.load();
      expect(loaded!.homeAgentPeerId).toBe("home-agent-peer-id");
      expect(loaded!.homeAgentPubKey).toContain("BEGIN PUBLIC KEY");
      expect(loaded!.deviceCertificateJson).toBe('{"cert":"data"}');
      expect(loaded!.sessionToken).toBe("tok-session-123");
    });
  });
});
