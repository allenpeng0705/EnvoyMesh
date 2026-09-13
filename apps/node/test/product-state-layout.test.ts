/**
 * §5 — end-to-end: does a real `NodeServiceImpl` write product state where it says it does?
 *
 * `product-state-dir.test.ts` pins the decision; this file pins the *wiring*, which is the
 * part that can be wrong in two different ways:
 *
 *   * a **product** store still reading the shared profile dir → on a fresh install the
 *     feature writes one root and reads the other, i.e. it looks like the user's data
 *     vanished;
 *   * a **kernel** store following the product dir → a second product cannot see the
 *     owner's identity/config/trust, which is worse than the first.
 *
 * So both directions are asserted with the same service instance: a kernel write must land
 * in `profile/`, and a product write must land in the product directory, with the sibling
 * location checked to be *empty* rather than merely "not what we expected".
 */

import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createHumanProfileStore,
  createLocalPeerDirectoryStore,
  createLocalTaskStore,
  createLocalTrustStore,
} from "@envoymesh/local-store";
import { KERNEL_PROFILE_ENTRIES, profileDirIn } from "@envoymesh/node-core";
import { afterEach, describe, expect, it } from "vitest";
import { NodeServiceImpl } from "../src/node-service-impl.js";
import { resolveProductStateDirFor } from "../src/product-state-dir.js";

const roots: string[] = [];

/**
 * Product artifacts this test actually exercises. A product file in the shared profile is
 * the other half of the split, and it is a narrower list on purpose: the point is to catch
 * the state *this* service wrote, not to enumerate every product file in the repo.
 */
const PRODUCT_ARTIFACTS = [
  "family-profiles.json",
  "family-rooms.json",
  "team-jobs",
  "chat-rooms.json",
  "chat-messages.jsonl",
  "published-library.json",
  "web",
];

function freshInstall(): { home: string; profileDir: string; vaultDir: string } {
  const home = mkdtempSync(join(tmpdir(), "envoy-layout-home-"));
  roots.push(home);
  const profileDir = profileDirIn(home);
  mkdirSync(profileDir, { recursive: true });
  const vaultDir = join(home, "vault");
  mkdirSync(vaultDir, { recursive: true });
  return { home, profileDir, vaultDir };
}

function service(profileDir: string, vaultDir: string): NodeServiceImpl {
  const svc = new NodeServiceImpl(
    undefined,
    createLocalTrustStore(profileDir),
    createLocalPeerDirectoryStore(profileDir),
    createHumanProfileStore(profileDir),
    profileDir,
    undefined,
    vaultDir,
  );
  svc.bindCliTaskStore(createLocalTaskStore(profileDir));
  return svc;
}

function filesIn(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).sort();
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("§5 product state layout — a real service", () => {
  it("writes product state into the product directory, and kernel state into the profile", async () => {
    const { profileDir, vaultDir } = freshInstall();
    const productDir = resolveProductStateDirFor(profileDir).dir;
    expect(productDir).not.toBe(profileDir);

    const svc = service(profileDir, vaultDir);

    // Kernel: the node config is one of the 14 kernel stores — it must stay shared.
    await svc.updateNodeConfig({ chatAssistEnabled: true });
    const configPath = join(profileDir, "node-config.json");
    expect(existsSync(configPath), "node-config.json belongs in the shared profile").toBe(true);
    expect(existsSync(join(productDir, "node-config.json"))).toBe(false);

    // Product: a family profile is the social product's own state.
    const created = await svc.createFamilyProfile({ name: "Layout Probe" });
    expect(created.ok ?? true).toBeTruthy();
    const familyPath = join(productDir, "family-profiles.json");
    expect(existsSync(familyPath), `family-profiles.json belongs in ${productDir}`).toBe(true);
    expect(
      existsSync(join(profileDir, "family-profiles.json")),
      "a product store must not write into the shared profile",
    ).toBe(false);

    // And the service reads it back from there.
    const listed = await svc.listFamilyProfiles();
    expect(JSON.stringify(listed)).toContain("Layout Probe");
  });

  it("keeps an existing install's state in the profile directory (adoption)", async () => {
    const { home, profileDir, vaultDir } = freshInstall();
    // Pretend this install predates §5: product state already written inside the profile.
    // (It has to be seeded directly — a service built by this code writes to the product
    // directory, which is the whole point of the change.)
    writeFileSync(join(profileDir, "chat-rooms.json"), "{}");
    writeFileSync(join(profileDir, "profile.json"), "{}");

    const state = resolveProductStateDirFor(profileDir);
    expect(state.layout).toBe("adopted");
    expect(state.dir).toBe(profileDir);
    // Nothing was copied, moved or created beside it: adoption means "leave it alone".
    expect(existsSync(join(home, "EnvoyMesh"))).toBe(false);

    // And the switched call sites resolve to that same directory, so a product write still
    // lands where the pre-§5 install expects it.
    const svc = service(profileDir, vaultDir);
    await svc.createFamilyProfile({ name: "Legacy Owner" });
    expect(existsSync(join(profileDir, "family-profiles.json"))).toBe(true);
    expect(existsSync(join(home, "EnvoyMesh"))).toBe(false);
    const listed = await svc.listFamilyProfiles();
    expect(JSON.stringify(listed)).toContain("Legacy Owner");
  });

  it("neither root holds the other's files (no cross-leakage in either direction)", async () => {
    const { profileDir, vaultDir } = freshInstall();
    const productDir = resolveProductStateDirFor(profileDir).dir;
    const svc = service(profileDir, vaultDir);
    await svc.updateNodeConfig({ chatAssistEnabled: true });
    await svc.createFamilyProfile({ name: "Leak Probe" });

    // Direction 1 — a kernel file must never appear in the product directory. This is the
    // dangerous one: identity/config/trust landing under a product means the next product
    // cannot see the owner at all.
    const kernelLeaks = filesIn(productDir).filter((name) => KERNEL_PROFILE_ENTRIES.includes(name));
    expect(kernelLeaks, `kernel files found in the product dir: ${kernelLeaks.join(", ")}`).toEqual([]);

    // Direction 2 — a product file must never appear in the shared profile. The service does
    // seed some product state eagerly (family profile, team jobs), which is fine; what is not
    // fine is that state living beside the identity.
    const productLeaks = filesIn(profileDir).filter((name) => PRODUCT_ARTIFACTS.includes(name));
    expect(productLeaks, `product files found in the shared profile: ${productLeaks.join(", ")}`).toEqual([]);

    // Both roots exist and each holds something — otherwise the two assertions above would
    // pass vacuously in a directory that was never written.
    expect(filesIn(productDir).length).toBeGreaterThan(0);
    expect(filesIn(profileDir).length).toBeGreaterThan(0);
  });
});
