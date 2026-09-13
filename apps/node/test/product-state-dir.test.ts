/**
 * §5 — the product state directory, and the two installs it has to serve.
 *
 * The migration is only safe because of an asymmetry worth testing directly: for an
 * **existing** install `productDir === profileDir`, so every switched call site is a no-op
 * and behaviour cannot change; for a **fresh** install the layout is decided here, and the
 * risk is a *partial* switch, where a feature writes to `<home>/<product>/` and reads from
 * `profile/` (or the reverse) and appears to lose data.
 *
 * These tests pin the decision itself. The end-to-end evidence that the stores follow it
 * lives in `product-state-layout.test.ts`, which drives a real `NodeServiceImpl`.
 */

import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { profileDirIn } from "@envoymesh/node-core";
import { UNCONFIGURED_PROFILE_DIR } from "../src/product-store-availability.js";
import {
  currentProductName,
  describeProductStateDir,
  resolveProductStateDirFor,
} from "../src/product-state-dir.js";

const roots: string[] = [];

function tempHome(): { home: string; profile: string } {
  const home = mkdtempSync(join(tmpdir(), "envoy-product-state-"));
  roots.push(home);
  const profile = profileDirIn(home);
  mkdirSync(profile, { recursive: true });
  return { home, profile };
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("resolveProductStateDirFor (§5)", () => {
  it("puts a fresh install's product state beside the profile, not inside it", () => {
    const { home, profile } = tempHome();
    // A fresh profile holds identity and kernel files only.
    writeFileSync(join(profile, "profile.json"), "{}");
    writeFileSync(join(profile, "libp2p-private.key"), "k");
    writeFileSync(join(profile, "node-config.json"), "{}");
    writeFileSync(join(profile, "audit-events.jsonl"), "");

    const state = resolveProductStateDirFor(profile);
    expect(state.dir).toBe(join(home, "EnvoyMesh"));
    expect(state.layout).toBe("split");
    expect(state.product).toBe("EnvoyMesh");
  });

  it("keeps an existing install's product state exactly where it is", () => {
    const { profile } = tempHome();
    writeFileSync(join(profile, "profile.json"), "{}");
    writeFileSync(join(profile, "libp2p-private.key"), "k");
    // Product state from before §5.
    writeFileSync(join(profile, "chat-rooms.json"), "{}");

    const state = resolveProductStateDirFor(profile);
    // Adoption is what makes the switch a no-op for every installed user.
    expect(state.dir).toBe(profile);
    expect(state.layout).toBe("adopted");
  });

  it("honours the product name a launcher sets", () => {
    const { home, profile } = tempHome();
    writeFileSync(join(profile, "profile.json"), "{}");
    const state = resolveProductStateDirFor(profile, "EnvoyCoder");
    expect(state.dir).toBe(join(home, "EnvoyCoder"));
    expect(currentProductName({ ENVOYMESH_APP_NAME: "EnvoyCoder" })).toBe("EnvoyCoder");
    expect(currentProductName({})).toBe("EnvoyMesh");
  });

  it("gives an unconfigured host the sentinel, so product stores stay unavailable", () => {
    for (const dir of [undefined, null, "", UNCONFIGURED_PROFILE_DIR]) {
      const state = resolveProductStateDirFor(dir);
      expect(state.dir).toBe(UNCONFIGURED_PROFILE_DIR);
      expect(state.layout).toBe("unconfigured");
    }
  });

  it("keeps a single-directory profile together, and does not nest a product dir in it", () => {
    // `ENVOYMESH_PROFILE=/some/dir` (or an old checkout's `./data/default`) is a profile in
    // its own right: `homeForProfileDir` says the home *is* that directory, so there is no
    // `<home>/profile` to sit beside. Splitting there would invent `<dir>/EnvoyMesh/` inside
    // the identity directory the user pointed at — and on a fresh install with no product
    // state to adopt, that is exactly what would happen without this rule.
    const dir = mkdtempSync(join(tmpdir(), "envoy-standalone-"));
    roots.push(dir);
    writeFileSync(join(dir, "profile.json"), "{}");
    const state = resolveProductStateDirFor(dir);
    expect(state.layout).toBe("standalone");
    expect(state.dir).toBe(dir);
    expect(existsSync(join(dir, "EnvoyMesh"))).toBe(false);
  });
});

describe("describeProductStateDir", () => {
  it("says which layout is in use, in the node's own voice", () => {
    const { profile } = tempHome();
    const adopted = describeProductStateDir({
      dir: profile, product: "EnvoyMesh", layout: "adopted", profileDir: profile,
    });
    expect(adopted).toContain("existing install");
    expect(adopted).toContain(profile);

    const fresh = describeProductStateDir({
      dir: "/home/owner/EnvoyMesh", product: "EnvoyMesh", layout: "split",
      profileDir: "/home/owner/profile",
    });
    expect(fresh).toContain("/home/owner/EnvoyMesh");
    expect(fresh).toContain("EnvoyMesh");
  });
});
