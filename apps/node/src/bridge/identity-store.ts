import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { BridgeIdentity } from "./pipe.js";

const BRIDGE_IDENTITY_FILENAME = "bridge-identity.json";

export async function loadBridgeIdentity(profileDir: string): Promise<BridgeIdentity | null> {
  try {
    const raw = await readFile(join(profileDir, BRIDGE_IDENTITY_FILENAME), "utf-8");
    const parsed = JSON.parse(raw);
    if (
      typeof parsed.agentPeerId === "string" &&
      typeof parsed.agentPublicKeyPem === "string" &&
      typeof parsed.agentPrivateKeyPem === "string" &&
      typeof parsed.ownerId === "string" &&
      parsed.agentCredential &&
      typeof parsed.agentCredential === "object"
    ) {
      return parsed as BridgeIdentity;
    }
    return null;
  } catch {
    return null;
  }
}

export async function saveBridgeIdentity(profileDir: string, identity: BridgeIdentity): Promise<void> {
  await mkdir(profileDir, { recursive: true });
  const tmp = join(profileDir, `${BRIDGE_IDENTITY_FILENAME}.tmp`);
  const target = join(profileDir, BRIDGE_IDENTITY_FILENAME);
  const body = JSON.stringify(identity, null, 2);
  await writeFile(tmp, body, { mode: 0o600 });
  try {
    await rename(tmp, target);
  } catch (err) {
    // Profile dir can race with harness cleanup during E2E teardown; rewrite.
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === "ENOENT") {
      await mkdir(profileDir, { recursive: true });
      await writeFile(target, body, { mode: 0o600 });
      return;
    }
    throw err;
  }
}
