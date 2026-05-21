import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const existsSyncMock = vi.hoisted(() => vi.fn(() => true));

vi.mock("node:fs", () => ({
  existsSync: existsSyncMock,
}));

import * as cli from "../src/kubo-ipfs-cli.js";
import {
  _resetKuboIpfsEngineForTests,
  ensureKuboIpfsReady,
  getKuboIpfsEngineStatus,
} from "../src/kubo-ipfs-engine.js";

afterEach(() => {
  vi.restoreAllMocks();
  existsSyncMock.mockReturnValue(true);
  _resetKuboIpfsEngineForTests();
});

describe("kubo-ipfs-engine", () => {
  beforeEach(() => {
    vi.spyOn(cli, "resolveIpfsPath").mockReturnValue("/tmp/envoy-ipfs-kubo");
    vi.spyOn(cli, "resolveIpfsExe").mockReturnValue("/tmp/ipfs");
  });

  it("getKuboIpfsEngineStatus reports unavailable when CLI missing", () => {
    vi.spyOn(cli, "kuboCliAvailableSync").mockReturnValue(false);
    const status = getKuboIpfsEngineStatus("/profile");
    expect(status.available).toBe(false);
    expect(status.errorHint).toMatch(/IPFS engine/i);
  });

  it("ensureKuboIpfsReady throws when CLI missing", async () => {
    vi.spyOn(cli, "kuboCliAvailableSync").mockReturnValue(false);
    await expect(ensureKuboIpfsReady({ profileDir: "/profile" })).rejects.toThrow(/IPFS engine/i);
  });

  it("ensureKuboIpfsReady returns when daemon API is already up", async () => {
    vi.spyOn(cli, "kuboCliAvailableSync").mockReturnValue(true);
    vi.spyOn(cli, "kuboDaemonReadySync").mockReturnValue(true);

    await expect(ensureKuboIpfsReady({ profileDir: "/profile" })).resolves.toBeUndefined();
  });
});
