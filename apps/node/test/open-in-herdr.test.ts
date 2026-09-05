import { EventEmitter } from "node:events";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createDeviceCertificate, generateDeviceIdentity, generateOwnerIdentity } from "@envoymesh/identity";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const spawnMock = vi.fn();

vi.mock("node:child_process", () => ({
  spawn: (...args: unknown[]) => spawnMock(...args),
  execFile: vi.fn(),
  execFileSync: vi.fn(),
  execSync: vi.fn(),
}));

import {
  createHumanProfileStore,
  createLocalPeerDirectoryStore,
  createLocalTrustStore,
} from "@envoymesh/local-store";
import { NodeServiceImpl } from "../src/node-service-impl.js";

describe("openInHerdr", () => {
  let profileDir: string;
  let node: NodeServiceImpl;

  beforeEach(async () => {
    spawnMock.mockReset();
    profileDir = await mkdtemp(join(tmpdir(), "envoy-open-herdr-"));
    const owner = generateOwnerIdentity();
    const device = generateDeviceIdentity();
    const profile = {
      owner,
      device,
      deviceCertificate: createDeviceCertificate({
        owner,
        device,
        deviceProfile: "primary",
        capabilities: ["mesh.listen", "message.send"],
      }),
    };
    node = new NodeServiceImpl(
      undefined,
      createLocalTrustStore(profileDir),
      createLocalPeerDirectoryStore(profileDir),
      createHumanProfileStore(profileDir),
      profileDir,
      profile,
    );
  });

  afterEach(async () => {
    await rm(profileDir, { recursive: true, force: true }).catch(() => undefined);
  });

  it("spawns detached herdr in openclaw workspace on success", async () => {
    spawnMock.mockImplementation(() => {
      const child = new EventEmitter() as EventEmitter & { pid?: number; unref: () => void };
      child.pid = 4242;
      child.unref = vi.fn();
      return child;
    });

    const result = await node.openInHerdr({});
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.cwd).toContain("openclaw-workspace");
    }
    expect(spawnMock).toHaveBeenCalledWith(
      "herdr",
      [],
      expect.objectContaining({
        detached: true,
        stdio: "ignore",
      }),
    );
    const child = spawnMock.mock.results[0]?.value as EventEmitter & { unref: ReturnType<typeof vi.fn> };
    expect(child.unref).toHaveBeenCalled();
  });

  it("returns spawnFailed when herdr is missing on PATH", async () => {
    spawnMock.mockImplementation(() => {
      const child = new EventEmitter() as EventEmitter & { unref: () => void };
      child.unref = vi.fn();
      queueMicrotask(() => child.emit("error", new Error("ENOENT")));
      return child;
    });

    const result = await node.openInHerdr({});
    expect(result).toEqual({ ok: false, reason: "herdr.spawnFailed" });
  });

  it("honors explicit cwd override", async () => {
    const customCwd = join(profileDir, "custom-workspace");
    await mkdir(customCwd, { recursive: true });
    spawnMock.mockImplementation(() => {
      const child = new EventEmitter() as EventEmitter & { pid?: number; unref: () => void };
      child.pid = 1;
      child.unref = vi.fn();
      return child;
    });

    const result = await node.openInHerdr({ cwd: customCwd });
    expect(result.ok).toBe(true);
    expect(spawnMock).toHaveBeenCalledWith("herdr", [], expect.objectContaining({ cwd: customCwd }));
  });
});
