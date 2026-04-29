import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

  it("recovers from corrupt discovery-seeds.json and writes a backup", async () => {
    await writeFile(
      join(profileDir, "discovery-seeds.json"),
      '{"version":"0.1","records":[{"addr":"/ip4/x","source":"manual-bootstrap","lastSuccessAt":"2026-04-01T00:00:00.000Z"}]}\n]\n}',
      "utf8",
    );
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const store = createDiscoverySeedStore(profileDir);
    await store.upsertSuccess("/ip4/9.9.9.9/tcp/4001/p2p/peer-recover", "peer.discovery");

    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
    expect(await store.listSeedAddrs()).toEqual(["/ip4/9.9.9.9/tcp/4001/p2p/peer-recover"]);
    const raw = JSON.parse(await readFile(join(profileDir, "discovery-seeds.json"), "utf8"));
    expect(raw.records.some((r: { addr: string }) => r.addr === "/ip4/9.9.9.9/tcp/4001/p2p/peer-recover")).toBe(true);

    const files = await readdir(profileDir);
    expect(files.some((f) => f.startsWith("discovery-seeds.json.corrupt.") && f.endsWith(".bak"))).toBe(true);
  });

  it("serializes concurrent upserts so every distinct addr is persisted", async () => {
    const store = createDiscoverySeedStore(profileDir);
    await Promise.all(
      Array.from({ length: 24 }, (_, i) =>
        store.upsertSuccess(
          `/ip4/10.0.${Math.floor(i / 16)}.${i % 256}/tcp/4001/p2p/p-${i}`,
          "peer.discovery",
          `2026-04-27T${String(i).padStart(2, "0")}:00:00.000Z`,
        ),
      ),
    );
    const addrs = await store.listSeedAddrs();
    expect(addrs).toHaveLength(24);
    expect(new Set(addrs).size).toBe(24);
  });
});
