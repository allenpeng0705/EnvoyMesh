/**
 * R2 — the envoy-harness execution pool builder (static discovery,
 * fail-open) with an injected connect for hermetic tests.
 */

import { describe, expect, it } from "vitest";

import type { ConnectPeerClientsResult } from "@envoymesh/envoy-harness-peer";
import type { MeshSubmitter } from "@envoymesh/envoy-harness";

import { buildEnvoyHarnessPeerPool } from "../src/agent-runtime-envoy/peer-pool.js";

function fakeRegistry(ids: string[]) {
  return {
    list: () =>
      ids.map((id) => ({
        id,
        client: {} as never,
        ...(id === "p2" ? { model: "claude-instant" } : {}),
      })),
    get: () => undefined,
    route: () => undefined,
    register: () => () => {},
    pickByModel: () => undefined,
  } as never;
}

function fakeConnect(peers: { id: string }[]): ConnectPeerClientsResult {
  const connected = peers.map((p) => p.id);
  return {
    registry: fakeRegistry(connected) as never,
    connected,
    failed: [],
    closeAll: () => {},
  };
}

describe("buildEnvoyHarnessPeerPool (R2)", () => {
  it("builds a cluster submitter from the static peer config", async () => {
    const pool = await buildEnvoyHarnessPeerPool(
      [
        { id: "p1", endpoint: "127.0.0.1:9001", model: "deepseek-chat" },
        { id: "p2", endpoint: "127.0.0.1:9002", model: "claude-instant" },
      ],
      fakeConnect as never,
    );
    expect(pool.connected).toEqual(["p1", "p2"]);
    expect(typeof pool.submitter.submit).toBe("function");
    expect(pool.registry.list()).toHaveLength(2);
    pool.closeAll();
  });

  it("fail-open: partial connects still yield a usable submitter", async () => {
    const pool = await buildEnvoyHarnessPeerPool(
      [{ id: "p1", endpoint: "bad" }],
      (async (peers) => ({
        registry: fakeRegistry([]) as never,
        connected: [],
        failed: peers.map((p) => ({ id: p.id, error: "boom" })),
        closeAll: () => {},
      })) as never,
    );
    expect(pool.connected).toEqual([]);
    expect(pool.failed).toEqual([{ id: "p1", error: "boom" }]);
    expect(typeof (pool.submitter as MeshSubmitter).submit).toBe("function");
    pool.closeAll();
  });
});
