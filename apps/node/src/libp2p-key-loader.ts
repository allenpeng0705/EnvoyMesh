import { generateKeyPair, privateKeyFromProtobuf, privateKeyToProtobuf } from "@libp2p/crypto/keys";
import type { PrivateKey } from "@libp2p/interface";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

/** Default filename stored under the node profile directory (alongside `profile.json`). */
export const DEFAULT_LIBP2P_PRIVATE_KEY_BASENAME = "libp2p-private.key";

function isMissingFileError(error: unknown): boolean {
  return error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT";
}

/**
 * Load protobuf-serialized libp2p private key from disk, or generate Ed25519 and persist it.
 * Stable keys imply stable libp2p Peer IDs and stable `/p2p/<peerId>` suffix in multiaddrs.
 *
 * Lives in the node app (not `@envoymesh/network`) so the network package has no
 * filesystem dependency — the Diplomat boundary stays clean.
 */
export async function loadOrCreateLibp2pPrivateKey(keyFilePath: string): Promise<PrivateKey> {
  try {
    const buf = await readFile(keyFilePath);
    return privateKeyFromProtobuf(new Uint8Array(buf));
  } catch (error: unknown) {
    if (!isMissingFileError(error)) {
      throw error;
    }
  }

  const pk = await generateKeyPair("Ed25519");
  await mkdir(dirname(keyFilePath), { recursive: true });
  await writeFile(keyFilePath, privateKeyToProtobuf(pk), { mode: 0o600 });
  return pk;
}
