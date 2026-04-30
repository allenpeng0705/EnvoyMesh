import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { EnvoyMesh } from "../src/index.js";
import { DEFAULT_LIBP2P_PRIVATE_KEY_BASENAME } from "../src/libp2p-key.js";

const meshes: EnvoyMesh[] = [];

afterEach(async () => {
  await Promise.all(meshes.splice(0).map((m) => m.stop()));
});

describe("libp2p private key persistence", () => {
  it("keeps the same libp2p Peer ID across restarts when libp2pPrivateKeyPath is set", async () => {
    const dir = await mkdtemp(join(tmpdir(), "envoymesh-libp2p-key-"));
    const keyPath = join(dir, DEFAULT_LIBP2P_PRIVATE_KEY_BASENAME);
    try {
      const m1 = new EnvoyMesh({
        listen: ["/ip4/127.0.0.1/tcp/0"],
        enableMdns: false,
        libp2pPrivateKeyPath: keyPath,
      });
      meshes.push(m1);
      await m1.start();
      const id1 = m1.peerId;
      await m1.stop();
      meshes.pop();

      const m2 = new EnvoyMesh({
        listen: ["/ip4/127.0.0.1/tcp/0"],
        enableMdns: false,
        libp2pPrivateKeyPath: keyPath,
      });
      meshes.push(m2);
      await m2.start();
      expect(m2.peerId).toBe(id1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("uses different Peer IDs without libp2pPrivateKeyPath (ephemeral)", async () => {
    const m1 = new EnvoyMesh({ listen: ["/ip4/127.0.0.1/tcp/0"], enableMdns: false });
    const m2 = new EnvoyMesh({ listen: ["/ip4/127.0.0.1/tcp/0"], enableMdns: false });
    meshes.push(m1, m2);
    await m1.start();
    await m2.start();
    expect(m1.peerId).not.toBe(m2.peerId);
  });
});
