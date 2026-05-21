import { join } from "node:path";
import { fileURLToPath } from "node:url";

const fixtureDir = join(fileURLToPath(new URL(".", import.meta.url)), "fixtures");

/** Frozen small-file golden fixture (see ipfs-kubo-golden.test.ts). */
export const IPFS_GOLDEN_SMALL_FIXTURE = join(fixtureDir, "ipfs-interop-v1.txt");

export const IPFS_GOLDEN_SMALL_FIXTURE_BYTES = "envoymesh kubo interop recipe v1 golden fixture\n";

/** Multi-chunk file size for layout/chunker parity ( > 256 KiB ). */
export const IPFS_GOLDEN_LARGE_FIXTURE_SIZE = 300 * 1024;

export function buildIpfsGoldenLargeFixtureBytes(): Buffer {
  const buf = Buffer.alloc(IPFS_GOLDEN_LARGE_FIXTURE_SIZE);
  for (let i = 0; i < buf.length; i += 1) {
    buf[i] = i % 256;
  }
  return buf;
}

export function ipfsParityTestEnabled(): boolean {
  return (
    process.env.ENVOYMESH_HELIA_PARITY_TEST === "1" || process.env.ENVOYMESH_IPFS_CLI_TEST === "1"
  );
}
