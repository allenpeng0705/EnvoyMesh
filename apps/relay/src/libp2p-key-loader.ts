import { generateKeyPair, privateKeyFromProtobuf, privateKeyToProtobuf } from "@libp2p/crypto/keys";
import type { PrivateKey } from "@libp2p/interface";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

/** Default filename stored under the relay profile directory. */
export const DEFAULT_LIBP2P_PRIVATE_KEY_BASENAME = "libp2p-private.key";

function isMissingFileError(error: unknown): boolean {
  return error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT";
}

/**
 * Load protobuf-serialized libp2p private key from disk, or generate Ed25519 and persist it.
 *
 * Mirrors the loader in `apps/node/src/libp2p-key-loader.ts`; relay and node apps do not
 * share a workspace path, so the function is duplicated here. Keep them in sync.
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
