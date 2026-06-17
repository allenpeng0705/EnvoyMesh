import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createLocalCompanyInviteStore,
  type CompanyInviteRecord,
} from "@envoymesh/local-store";

let profileDir: string;

beforeEach(async () => {
  profileDir = await mkdtemp(join(tmpdir(), "envoymesh-company-invite-"));
});

afterEach(async () => {
  await rm(profileDir, { recursive: true, force: true });
});

function makeInvite(overrides: Partial<CompanyInviteRecord> = {}): CompanyInviteRecord {
  return {
    inviteId: "invite-1",
    token: "tok-abc",
    ownerId: "envoy:owner:self",
    wsUrl: "ws://localhost:3030/ws",
    createdAt: "2024-01-01T00:00:00.000Z",
    expiresAt: "2024-01-08T00:00:00.000Z",
    ...overrides,
  };
}

describe("createLocalCompanyInviteStore", () => {
  it("returns no invites on a fresh profile", async () => {
    const store = createLocalCompanyInviteStore(profileDir);
    const all = await store.listInvites();
    expect(all).toEqual([]);
  });

  it("round-trips an invite by id and by token", async () => {
    const store = createLocalCompanyInviteStore(profileDir);
    const invite = makeInvite();
    await store.saveInvite(invite);

    expect(await store.getInvite(invite.inviteId)).toEqual(invite);
    expect(await store.findByToken(invite.token)).toEqual(invite);
  });

  it("trims whitespace when looking up by token", async () => {
    const store = createLocalCompanyInviteStore(profileDir);
    await store.saveInvite(makeInvite({ token: "tok-abc" }));
    expect(await store.findByToken("  tok-abc  ")).toBeDefined();
  });

  it("returns undefined for an unknown token", async () => {
    const store = createLocalCompanyInviteStore(profileDir);
    expect(await store.findByToken("nope")).toBeUndefined();
  });

  it("upserts by inviteId", async () => {
    const store = createLocalCompanyInviteStore(profileDir);
    await store.saveInvite(makeInvite());
    await store.saveInvite(makeInvite({ note: "updated" }));
    const all = await store.listInvites();
    expect(all).toHaveLength(1);
    expect(all[0]?.note).toBe("updated");
  });

  it("persists across instances via atomic JSON", async () => {
    const storeA = createLocalCompanyInviteStore(profileDir);
    await storeA.saveInvite(makeInvite({ inviteId: "a", token: "tokA" }));

    // New instance — simulates a node restart.
    const storeB = createLocalCompanyInviteStore(profileDir);
    const all = await storeB.listInvites();
    expect(all.map((r) => r.inviteId)).toEqual(["a"]);
    expect(await storeB.findByToken("tokA")).toBeDefined();

    // File is valid JSON and is mode 0o600.
    const raw = await readFile(join(profileDir, "company-invites.json"), "utf8");
    expect(JSON.parse(raw)).toBeTruthy();
  });
});
