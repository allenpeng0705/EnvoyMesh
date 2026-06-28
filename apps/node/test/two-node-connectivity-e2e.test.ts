/**
 * Two-node connectivity e2e test (in-process).
 *
 * Creates two EnvoyMesh instances directly, bonds them via explicit
 * dial hints, and verifies the libp2p connection succeeds.
 *
 * Run: npx vitest run apps/node/test/two-node-connectivity-e2e.test.ts
 */
import { describe, expect, it } from "vitest";
import { EnvoyMesh } from "@envoymesh/network";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateKeyPair } from "@libp2p/crypto/keys";
import { peerIdFromPrivateKey } from "@libp2p/peer-id";

describe("two-node connectivity (in-process)", () => {
  it(
    "two nodes connect directly via explicit dial hints",
    async () => {
      const dir1 = await mkdtemp(join(tmpdir(), "envoymesh-e2e-ip-1-"));
      const dir2 = await mkdtemp(join(tmpdir(), "envoymesh-e2e-ip-2-"));

      try {
        // Generate keys
        const key1 = await generateKeyPair("Ed25519");
        const key2 = await generateKeyPair("Ed25519");
        const pid1 = peerIdFromPrivateKey(key1);
        const pid2 = peerIdFromPrivateKey(key2);

        // Create node 1
        const mesh1 = new EnvoyMesh({
          listen: "/ip4/127.0.0.1/tcp/0",
          enableMdns: false,
          enableDht: false,
          enableRelay: false,
          enableAutoNat: false,
          enableDcutr: false,
          enableQuic: false,
          libp2pPrivateKey: key1,
        });

        // Create node 2
        const mesh2 = new EnvoyMesh({
          listen: "/ip4/127.0.0.1/tcp/0",
          enableMdns: false,
          enableDht: false,
          enableRelay: false,
          enableAutoNat: false,
          enableDcutr: false,
          enableQuic: false,
          libp2pPrivateKey: key2,
        });

        await mesh1.start();
        await mesh2.start();

        const addrs1 = mesh1.node?.getMultiaddrs() ?? [];
        const addrs2 = mesh2.node?.getMultiaddrs() ?? [];

        expect(addrs1.length).toBeGreaterThan(0);
        expect(addrs2.length).toBeGreaterThan(0);

        // Node 2 dials node 1 using its listen address
        const n2Connect = await mesh2.ensurePeerReachable(
          pid1.toString(),
          "/envoymesh/message/0.1.0",
          {
            dialHints: addrs1.map((a) => a.toString()),
            forceFreshDial: true,
          },
        );

        expect(n2Connect.connected).toBe(true);

        // Node 1 dials node 2
        const n1Connect = await mesh1.ensurePeerReachable(
          pid2.toString(),
          "/envoymesh/message/0.1.0",
          {
            dialHints: addrs2.map((a) => a.toString()),
            forceFreshDial: true,
          },
        );

        expect(n1Connect.connected).toBe(true);

        // Cleanup
        await mesh1.stop();
        await mesh2.stop();

        console.log(
          `[e2e:in-process] PASS n1=${pid1.toString().slice(0, 12)}… n2=${pid2.toString().slice(0, 12)}…`,
        );
      } finally {
        await rm(dir1, { recursive: true, force: true }).catch(() => {});
        await rm(dir2, { recursive: true, force: true }).catch(() => {});
      }
    },
    30_000,
  );
});
