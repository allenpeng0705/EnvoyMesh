import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createLocalCompanyInviteStore } from "@envoymesh/local-store";
import type { CompanyInviteRecord } from "@envoymesh/api";
import {
  consumeCompanyInviteViaRuntime,
  createCompanyInviteViaRuntime,
  listCompanyInvitesViaRuntime,
  revokeCompanyInviteViaRuntime,
} from "../src/node-service-company-invite.js";

let profileDir: string;

beforeEach(async () => {
  profileDir = await mkdtemp(join(tmpdir(), "envoymesh-company-invite-runtime-"));
});

afterEach(async () => {
  await rm(profileDir, { recursive: true, force: true });
});

const baseDeps = () => {
  const taskStore = {
    saveCompanyInvite: async (r: CompanyInviteRecord) => createLocalCompanyInviteStore(profileDir).saveInvite(r),
    getCompanyInvite: async (id: string) => createLocalCompanyInviteStore(profileDir).getInvite(id),
    findCompanyInviteByToken: async (t: string) => createLocalCompanyInviteStore(profileDir).findByToken(t),
    listCompanyInvites: async () => createLocalCompanyInviteStore(profileDir).listInvites(),
  };
  return {
    taskStore: taskStore as unknown as Parameters<typeof createCompanyInviteViaRuntime>[0]["taskStore"],
    ownerId: "envoy:owner:self",
    ownerPublicKey: "pem-owner",
    agentPeerId: "envoy_agent:1",
    agentName: "agent",
    wsUrl: "ws://localhost:3030/ws",
    lanWsUrl: "ws://192.168.1.5:3030/ws",
    relayWsUrl: "wss://relay.example.com",
    homeNodePeerId: "envoy_home:1",
  };
};

describe("createCompanyInviteViaRuntime", () => {
  it("mints a fresh invite with default 7-day expiry and a unique bearer token", async () => {
    const deps = baseDeps();
    const result = await createCompanyInviteViaRuntime(deps);
    expect(result.invite.token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(result.invite.token.length).toBeGreaterThanOrEqual(40);
    expect(result.invite.ownerId).toBe("envoy:owner:self");
    expect(result.uri).toMatch(/^envoy:\/\/invite\?/);
    expect(result.uri).toContain(`token=${encodeURIComponent(result.invite.token)}`);
    // Default 7 days = 168h
    const delta = Date.parse(result.invite.expiresAt) - Date.parse(result.invite.createdAt);
    expect(delta).toBe(168 * 60 * 60 * 1000);
  });

  it("clamps expiresInHours to a sane range", async () => {
    const deps = baseDeps();
    const result = await createCompanyInviteViaRuntime(deps, { expiresInHours: 999_999 });
    const delta = Date.parse(result.invite.expiresAt) - Date.parse(result.invite.createdAt);
    expect(delta).toBeLessThanOrEqual(24 * 365 * 60 * 60 * 1000);
  });

  it("ignores a zero/negative expiresInHours and falls back to 7 days", async () => {
    const deps = baseDeps();
    const result = await createCompanyInviteViaRuntime(deps, { expiresInHours: 0 });
    const delta = Date.parse(result.invite.expiresAt) - Date.parse(result.invite.createdAt);
    expect(delta).toBe(168 * 60 * 60 * 1000);
  });

  it("trims the note before persisting", async () => {
    const deps = baseDeps();
    const result = await createCompanyInviteViaRuntime(deps, { note: "  marketing laptop  " });
    expect(result.invite.note).toBe("marketing laptop");
  });

  it("returns an empty note when only whitespace is given", async () => {
    const deps = baseDeps();
    const result = await createCompanyInviteViaRuntime(deps, { note: "   " });
    expect(result.invite.note).toBeUndefined();
  });
});

describe("listCompanyInvitesViaRuntime", () => {
  it("returns an empty list on a fresh store", async () => {
    const deps = baseDeps();
    expect(await listCompanyInvitesViaRuntime(deps.taskStore)).toEqual({ invites: [] });
  });

  it("returns all invites in insertion order", async () => {
    const deps = baseDeps();
    await createCompanyInviteViaRuntime(deps, { note: "first" });
    await createCompanyInviteViaRuntime(deps, { note: "second" });
    const { invites } = await listCompanyInvitesViaRuntime(deps.taskStore);
    expect(invites.map((i) => i.note)).toEqual(["first", "second"]);
  });
});

describe("revokeCompanyInviteViaRuntime", () => {
  it("sets revokedAt and is idempotent", async () => {
    const deps = baseDeps();
    const { invite } = await createCompanyInviteViaRuntime(deps);
    const first = await revokeCompanyInviteViaRuntime(deps.taskStore, invite.inviteId);
    expect(first.invite.revokedAt).toBeDefined();
    const second = await revokeCompanyInviteViaRuntime(deps.taskStore, invite.inviteId);
    expect(second.invite.revokedAt).toBe(first.invite.revokedAt);
  });

  it("throws when the invite is unknown", async () => {
    const deps = baseDeps();
    await expect(revokeCompanyInviteViaRuntime(deps.taskStore, "missing")).rejects.toThrow(
      /not found/i,
    );
  });
});

describe("consumeCompanyInviteViaRuntime", () => {
  it("rejects an unknown token", async () => {
    const deps = baseDeps();
    expect(await consumeCompanyInviteViaRuntime(deps.taskStore, "nope", "device-1")).toBeUndefined();
  });

  it("rejects a revoked invite", async () => {
    const deps = baseDeps();
    const { invite } = await createCompanyInviteViaRuntime(deps);
    await revokeCompanyInviteViaRuntime(deps.taskStore, invite.inviteId);
    expect(
      await consumeCompanyInviteViaRuntime(deps.taskStore, invite.token, "device-1"),
    ).toBeUndefined();
  });

  it("rejects an expired invite", async () => {
    const deps = baseDeps();
    const { invite } = await createCompanyInviteViaRuntime(deps);
    // Backdate the expiresAt to the past.
    const store = createLocalCompanyInviteStore(profileDir);
    const backdated = { ...invite, expiresAt: new Date(Date.now() - 1000).toISOString() };
    await store.saveInvite(backdated);
    expect(
      await consumeCompanyInviteViaRuntime(deps.taskStore, invite.token, "device-1"),
    ).toBeUndefined();
  });

  it("marks the invite used and remembers the consuming device", async () => {
    const deps = baseDeps();
    const { invite } = await createCompanyInviteViaRuntime(deps);
    const consumed = await consumeCompanyInviteViaRuntime(
      deps.taskStore,
      invite.token,
      "device-A",
    );
    expect(consumed?.usedAt).toBeDefined();
    expect(consumed?.usedByDeviceId).toBe("device-A");
  });

  it("is idempotent for the same device but rejects a different device", async () => {
    const deps = baseDeps();
    const { invite } = await createCompanyInviteViaRuntime(deps);
    const first = await consumeCompanyInviteViaRuntime(deps.taskStore, invite.token, "device-A");
    const second = await consumeCompanyInviteViaRuntime(deps.taskStore, invite.token, "device-A");
    const third = await consumeCompanyInviteViaRuntime(deps.taskStore, invite.token, "device-B");
    expect(first?.inviteId).toBe(invite.inviteId);
    expect(second?.usedAt).toBe(first?.usedAt);
    expect(third).toBeUndefined();
  });
});
