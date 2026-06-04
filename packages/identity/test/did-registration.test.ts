import { describe, expect, it } from "vitest";
import {
  validateDIDName,
  registerDIDName,
  lookupDIDName,
  unregisterDIDName,
  buildDIDDocument,
  type DIDRegistrationDeps,
  type DIDLookupDeps,
} from "../src/did-registration.js";

describe("did-registration", () => {
  describe("validateDIDName", () => {
    it("accepts valid names", () => {
      expect(validateDIDName("alice").valid).toBe(true);
      expect(validateDIDName("bob-dev").valid).toBe(true);
      expect(validateDIDName("web3-builder").valid).toBe(true);
    });

    it("rejects names under 3 chars", () => {
      expect(validateDIDName("ab").valid).toBe(false);
      expect(validateDIDName("ab").reason).toContain("at least 3");
    });

    it("rejects names over 32 chars", () => {
      expect(validateDIDName("a".repeat(33)).valid).toBe(false);
    });

    it("rejects reserved names", () => {
      expect(validateDIDName("envoy").valid).toBe(false);
      expect(validateDIDName("admin").valid).toBe(false);
      expect(validateDIDName("system").valid).toBe(false);
    });

    it("rejects names with special chars", () => {
      expect(validateDIDName("alice@bob").valid).toBe(false);
      expect(validateDIDName("hello world").valid).toBe(false);
    });

    it("rejects leading/trailing hyphens", () => {
      expect(validateDIDName("-alice").valid).toBe(false);
      expect(validateDIDName("alice-").valid).toBe(false);
    });

    it("rejects empty name", () => {
      expect(validateDIDName("").valid).toBe(false);
    });
  });

  describe("registerDIDName", () => {
    function makeDeps(existingNames: string[] = [], dhtConflict = false): DIDRegistrationDeps {
      const registrations = existingNames.map((n) => ({
        didName: n,
        did: `did:envoy:${n}`,
        ownerId: `envoy:owner:existing`,
        peerId: "peer-existing",
        registeredAt: new Date().toISOString(),
      }));
      return {
        ownerId: "envoy:owner:abc123",
        peerId: "peer-abc",
        advertiseOnDht: async () => {},
        removeFromDht: async () => {},
        saveLocalRegistration: async () => {},
        loadLocalRegistrations: async () => registrations,
        deleteLocalRegistration: async () => {},
        checkDhtConflict: async () => dhtConflict,
      };
    }

    it("registers a valid name", async () => {
      const deps = makeDeps();
      const result = await registerDIDName(deps, "alice");
      expect(result.ok).toBe(true);
      expect(result.registration!.did).toBe("did:envoy:alice");
      expect(result.registration!.ownerId).toBe("envoy:owner:abc123");
    });

    it("rejects invalid name", async () => {
      const deps = makeDeps();
      const result = await registerDIDName(deps, "ab");
      expect(result.ok).toBe(false);
      expect(result.error).toContain("at least 3");
    });

    it("detects DHT conflict", async () => {
      const deps = makeDeps([], true);
      const result = await registerDIDName(deps, "alice");
      expect(result.ok).toBe(false);
      expect(result.error).toContain("already registered");
    });

    it("returns existing if already registered by same owner", async () => {
      const deps = makeDeps(["alice"]);
      // Override ownerId so it matches
      (deps as any).ownerId = "envoy:owner:existing";
      const result = await registerDIDName(deps, "alice");
      expect(result.ok).toBe(true);
    });
  });

  describe("lookupDIDName", () => {
    function makeDeps(cached: boolean, dhtProviders: Array<{ ownerId: string; peerId: string }> = []): DIDLookupDeps {
      return {
        findOnDht: async () => dhtProviders,
        lookupLocalCache: async () =>
          cached
            ? { didName: "alice", did: "did:envoy:alice", ownerId: "envoy:owner:abc", peerId: "peer-abc", registeredAt: new Date().toISOString() }
            : null,
      };
    }

    it("finds in local cache", async () => {
      const deps = makeDeps(true);
      const result = await lookupDIDName(deps, "alice");
      expect(result.found).toBe(true);
      expect(result.registration!.did).toBe("did:envoy:alice");
    });

    it("falls back to DHT when not cached", async () => {
      const deps = makeDeps(false, [{ ownerId: "envoy:owner:dht", peerId: "peer-dht" }]);
      const result = await lookupDIDName(deps, "alice");
      expect(result.found).toBe(true);
      expect(result.registration!.ownerId).toBe("envoy:owner:dht");
    });

    it("returns not found when not cached and not on DHT", async () => {
      const deps = makeDeps(false, []);
      const result = await lookupDIDName(deps, "alice");
      expect(result.found).toBe(false);
      expect(result.error).toContain("no peer found");
    });

    it("rejects invalid names on lookup", async () => {
      const deps = makeDeps(false);
      const result = await lookupDIDName(deps, "ab");
      expect(result.found).toBe(false);
    });
  });

  describe("unregisterDIDName", () => {
    it("unregisters successfully", async () => {
      let deleted = "";
      const deps: DIDRegistrationDeps = {
        ownerId: "envoy:owner:abc",
        peerId: "peer-abc",
        advertiseOnDht: async () => {},
        removeFromDht: async () => {},
        saveLocalRegistration: async () => {},
        loadLocalRegistrations: async () => [],
        deleteLocalRegistration: async (name) => { deleted = name; },
        checkDhtConflict: async () => false,
      };
      const result = await unregisterDIDName(deps, "alice");
      expect(result.ok).toBe(true);
      expect(deleted).toBe("alice");
    });
  });

  describe("buildDIDDocument", () => {
    it("produces valid W3C DID document", () => {
      const reg = {
        didName: "alice",
        did: "did:envoy:alice",
        ownerId: "envoy:owner:abc123",
        peerId: "peer-abc",
        registeredAt: new Date().toISOString(),
      };
      const doc = buildDIDDocument(reg, "-----BEGIN PUBLIC KEY-----");
      expect(doc.id).toBe("did:envoy:alice");
      expect(doc.alsoKnownAs).toContain("envoy:owner:abc123");
      expect(doc.verificationMethod).toHaveLength(1);
      expect(doc.authentication).toContain("did:envoy:alice#key-1");
    });

    it("includes relay service when provided", () => {
      const reg = { didName: "alice", did: "did:envoy:alice", ownerId: "envoy:owner:abc", peerId: "peer-abc", registeredAt: new Date().toISOString() };
      const doc = buildDIDDocument(reg, "pk", "/ip4/1.2.3.4/tcp/4001");
      expect(doc.service).toHaveLength(1);
    });

    it("omits service when no relay", () => {
      const reg = { didName: "alice", did: "did:envoy:alice", ownerId: "envoy:owner:abc", peerId: "peer-abc", registeredAt: new Date().toISOString() };
      const doc = buildDIDDocument(reg, "pk");
      expect(doc.service).toHaveLength(0);
    });
  });
});
