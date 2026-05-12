import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, rm, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { loadBridgeIdentity, saveBridgeIdentity } from "../src/bridge/identity-store.js";
import type { BridgeIdentity } from "../src/bridge/pipe.js";

describe("bridge identity-store", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = join(tmpdir(), `envoymesh-bridge-test-${randomUUID()}`);
    await mkdir(tmpDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  const sampleIdentity: BridgeIdentity = {
    agentPeerId: "envoy_agent_test123",
    agentPublicKeyPem: "-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEA...\n-----END PUBLIC KEY-----",
    agentPrivateKeyPem: "-----BEGIN PRIVATE KEY-----\nMC4CAQAwBQYDK2VwBCIE...\n-----END PRIVATE KEY-----",
    ownerId: "envoy:owner:abc123",
    agentCredential: {
      version: "0.1",
      credentialId: "agent_cred_test123",
      ownerId: "envoy:owner:abc123",
      ownerPublicKeyPem: "-----BEGIN PUBLIC KEY-----\nowner\n-----END PUBLIC KEY-----",
      agentId: "envoy:agent:test123",
      agentPeerId: "envoy_agent_test123",
      agentPublicKeyPem: "-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEA...\n-----END PUBLIC KEY-----",
      scope: ["chat.message"],
      issuedAt: "2026-05-12T00:00:00.000Z",
      expiresAt: null,
      signature: "sig",
    },
  };

  it("returns null when no identity file exists", async () => {
    const result = await loadBridgeIdentity(tmpDir);
    expect(result).toBeNull();
  });

  it("saves and loads bridge identity", async () => {
    await saveBridgeIdentity(tmpDir, sampleIdentity);
    const loaded = await loadBridgeIdentity(tmpDir);
    expect(loaded).toEqual(sampleIdentity);
  });

  it("returns null when identity file is malformed JSON", async () => {
    const { writeFile } = await import("node:fs/promises");
    await writeFile(join(tmpDir, "bridge-identity.json"), "not-json", { mode: 0o600 });
    const result = await loadBridgeIdentity(tmpDir);
    expect(result).toBeNull();
  });

  it("returns null when identity file has missing fields", async () => {
    const { writeFile } = await import("node:fs/promises");
    await writeFile(join(tmpDir, "bridge-identity.json"), JSON.stringify({ agentPeerId: "x" }), { mode: 0o600 });
    const result = await loadBridgeIdentity(tmpDir);
    expect(result).toBeNull();
  });

  it("persists identity to the correct filename", async () => {
    await saveBridgeIdentity(tmpDir, sampleIdentity);
    const raw = await readFile(join(tmpDir, "bridge-identity.json"), "utf-8");
    const parsed = JSON.parse(raw);
    expect(parsed.agentPeerId).toBe(sampleIdentity.agentPeerId);
    expect(parsed.ownerId).toBe(sampleIdentity.ownerId);
  });
});
