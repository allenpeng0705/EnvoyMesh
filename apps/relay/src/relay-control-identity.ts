/**
 * Persistent Ed25519 identity for signing relay control envelopes (lookup forward, hints).
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  derivePeerId,
  generateEd25519KeyPair,
  signUnsignedEnvelope,
} from "@envoymesh/identity";
import {
  createUnsignedEnvelope,
  type EnvoyEnvelope,
  type EnvoyIntent,
} from "@envoymesh/protocol";

export interface RelayControlIdentity {
  peerId: string;
  publicKeyPem: string;
  privateKeyPem: string;
  signControl(input: {
    intent: EnvoyIntent;
    payload: unknown;
    recipientPeerId?: string;
    correlationId?: string;
  }): EnvoyEnvelope;
}

export async function loadOrCreateRelayControlIdentity(
  profileDir: string,
): Promise<RelayControlIdentity> {
  const keyPath = join(profileDir, "relay-control-ed25519.json");
  let publicKeyPem: string;
  let privateKeyPem: string;
  try {
    const raw = JSON.parse(await readFile(keyPath, "utf8")) as {
      publicKeyPem?: string;
      privateKeyPem?: string;
    };
    if (!raw.publicKeyPem?.includes("BEGIN") || !raw.privateKeyPem?.includes("BEGIN")) {
      throw new Error("incomplete key file");
    }
    publicKeyPem = raw.publicKeyPem;
    privateKeyPem = raw.privateKeyPem;
  } catch {
    const pair = generateEd25519KeyPair();
    publicKeyPem = pair.publicKeyPem;
    privateKeyPem = pair.privateKeyPem;
    await mkdir(dirname(keyPath), { recursive: true });
    await writeFile(
      keyPath,
      JSON.stringify({ publicKeyPem, privateKeyPem }, null, 2),
      { mode: 0o600 },
    );
  }

  const peerId = derivePeerId(publicKeyPem);
  return {
    peerId,
    publicKeyPem,
    privateKeyPem,
    signControl(input) {
      return signUnsignedEnvelope(
        createUnsignedEnvelope({
          senderPeerId: peerId,
          senderPublicKey: publicKeyPem,
          senderRole: "system",
          recipientPeerId: input.recipientPeerId,
          intent: input.intent,
          payload: input.payload,
          correlationId: input.correlationId,
        }),
        privateKeyPem,
      );
    },
  };
}
