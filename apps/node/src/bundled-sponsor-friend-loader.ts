import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseSetupSponsorFriendConfig,
  type SetupSponsorFriendConfig,
} from "@envoymesh/api";

const BUNDLED_FILENAME = "bundled-sponsor-friend.json";

let cachedBundled: SetupSponsorFriendConfig | null | undefined;

function parseBundledJson(raw: string): SetupSponsorFriendConfig | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parseSetupSponsorFriendConfig(parsed) ?? null;
  } catch {
    return null;
  }
}

/** Read sponsor friend defaults shipped with the node bundle (or env override). */
export async function loadBundledSponsorFriendConfig(
  nodeBundleDir?: string,
): Promise<SetupSponsorFriendConfig | null> {
  if (cachedBundled !== undefined) {
    return cachedBundled;
  }

  const envJson = process.env.ENVOYMESH_BUNDLED_SPONSOR_FRIEND_JSON?.trim();
  if (envJson) {
    cachedBundled = parseBundledJson(envJson);
    return cachedBundled;
  }

  const envPath = process.env.ENVOYMESH_BUNDLED_SPONSOR_FRIEND_PATH?.trim();
  if (envPath) {
    try {
      const raw = await readFile(envPath, "utf8");
      cachedBundled = parseBundledJson(raw);
      return cachedBundled;
    } catch {
      cachedBundled = null;
      return null;
    }
  }

  const candidates: string[] = [];
  if (nodeBundleDir?.trim()) {
    candidates.push(join(nodeBundleDir.trim(), BUNDLED_FILENAME));
  }
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    candidates.push(join(here, "..", "..", "..", BUNDLED_FILENAME));
    candidates.push(join(here, "..", BUNDLED_FILENAME));
  } catch {
    // import.meta.url unavailable in some test runners
  }

  for (const path of candidates) {
    try {
      const raw = await readFile(path, "utf8");
      const parsed = parseBundledJson(raw);
      if (parsed) {
        cachedBundled = parsed;
        return parsed;
      }
    } catch {
      // try next candidate
    }
  }

  cachedBundled = null;
  return null;
}

/** Test helper — reset module cache. */
export function resetBundledSponsorFriendCache(): void {
  cachedBundled = undefined;
}

export { BUNDLED_FILENAME };
