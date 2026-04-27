import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDiscoverySeedStore } from "../src/discovery-seed-store.js";

let profileDir: string;

beforeEach(async () => {
  profileDir = await mkdtemp(join(tmpdir(), "envoymesh-discovery-seeds-"));
});

afterEach(async () => {
  await rm(profileDir, { recursive: true, force: true });
});

describe("discovery seed store", () => {
  it("upserts and deduplicates seed addresses", async () => {
    const store = createDiscoverySeedStore(profileDir);
    await store.upsertSuccess(" /ip4/1.1.1.1/tcp/4001/p2p/peer-a ", "manual-bootstrap", "2026-04-27T10:00:00.000Z");
    await store.upsertSuccess("/ip4/1.1.1.1/tcp/4001/p2p/peer-a", "bootstrap-probe", "2026-04-27T10:05:00.000Z");
    await store.upsertSuccess("/ip4/2.2.2.2/tcp/4001/p2p/peer-b", "peer.discovery", "2026-04-27T10:03:00.000Z");

    const records = await store.listSeedRecords();
    expect(records).toHaveLength(2);
    expect(records[0]).toMatchObject({
      addr: "/ip4/1.1.1.1/tcp/4001/p2p/peer-a",
      source: "bootstrap-probe",
      lastSuccessAt: "2026-04-27T10:05:00.000Z",
    });
    expect(records[1].addr).toBe("/ip4/2.2.2.2/tcp/4001/p2p/peer-b");
  });

  it("ignores empty addresses in batch upsert", async () => {
    const store = createDiscoverySeedStore(profileDir);
    await store.upsertMany(["", "   ", "/ip4/3.3.3.3/tcp/4001/p2p/peer-c"], "peer.discovery", "2026-04-27T10:00:00.000Z");
    const addrs = await store.listSeedAddrs();
    expect(addrs).toEqual(["/ip4/3.3.3.3/tcp/4001/p2p/peer-c"]);
  });
});
