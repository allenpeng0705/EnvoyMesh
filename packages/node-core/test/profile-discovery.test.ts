/**
 * The discovery model — what a product tells the user, and what they can choose.
 *
 * Two things are asserted here that a UI cannot: that every reachable state has a
 * choice (a dialog with no way forward is worse than no dialog), and that the
 * wording stays end-user-readable — no raw paths in the headline, no `undefined`,
 * no developer vocabulary, and never a choice that deletes the user's identity.
 *
 * Design: `docs/envoymesh-multi-product-design.md` §6.
 */

import { describe, expect, it } from "vitest";
import { describeProfileSituation } from "../src/profile-discovery.js";
import type { ProfileInspection } from "../src/envoymesh-home.js";

function inspection(over: Partial<ProfileInspection> = {}): ProfileInspection {
  return {
    state: "found",
    dir: "/Users/alice/Library/Application Support/EnvoyMesh/profile",
    missing: [],
    unreadable: [],
    ownerId: "envoy:owner:9b2f4c1a7e33",
    displayName: "Alice",
    ...over,
  };
}

const BASE = {
  product: "EnvoyCoder",
  home: "/Users/alice/Library/Application Support/EnvoyMesh",
  profileDir: "/Users/alice/Library/Application Support/EnvoyMesh/profile",
};

describe("describeProfileSituation", () => {
  it("offers to use a found profile, and says whose it is", () => {
    const situation = describeProfileSituation({ ...BASE, inspection: inspection() });
    expect(situation.state).toBe("found");
    expect(situation.headline).toContain("Alice");
    expect(situation.detail).toContain("contacts and files stay the same");
    expect(situation.choices.map((c) => c.id)).toEqual(["use", "create", "choose-folder"]);
    expect(situation.choices.find((c) => c.id === "use")?.recommended).toBe(true);
  });

  it("names the app that last used the profile, unless the product is that app", () => {
    const withApp = describeProfileSituation({
      ...BASE,
      inspection: inspection(),
      lastUsedByApp: "EnvoyMesh",
    });
    expect(withApp.detail).toContain("last used by EnvoyMesh");

    const sameProduct = describeProfileSituation({
      ...BASE,
      product: "EnvoyMesh",
      inspection: inspection(),
      lastUsedByApp: "EnvoyMesh",
    });
    expect(sameProduct.detail).not.toContain("last used by");
  });

  it("falls back to a short owner id when there is no display name", () => {
    const situation = describeProfileSituation({
      ...BASE,
      inspection: inspection({ displayName: undefined }),
    });
    expect(situation.headline).toContain("9b2f4c1a7e33");
    // The `envoy:owner:` prefix is developer-facing and must not reach the user.
    expect(situation.headline).not.toContain("envoy:owner:");
  });

  it("says a profile will be created when there is none", () => {
    const situation = describeProfileSituation({
      ...BASE,
      inspection: inspection({ state: "missing", ownerId: undefined, displayName: undefined }),
    });
    expect(situation.state).toBe("missing");
    expect(situation.headline).toMatch(/no profile/i);
    expect(situation.choices.find((c) => c.id === "create")?.recommended).toBe(true);
    expect(situation.detail).toContain(BASE.profileDir);
  });

  it("reports a damaged profile, naming what is wrong, and never offers to delete it", () => {
    const situation = describeProfileSituation({
      ...BASE,
      inspection: inspection({ state: "damaged", missing: ["libp2p-private.key"] }),
    });
    expect(situation.state).toBe("damaged");
    expect(situation.detail).toContain("libp2p-private.key");
    expect(situation.detail).toContain("Nothing has been changed");
    // The destructive option does not exist: the files are the user's identity.
    expect(situation.choices.map((c) => c.id)).not.toContain("delete");
    expect(situation.choices.find((c) => c.id === "choose-folder")?.recommended).toBe(true);
    const startFresh = situation.choices.find((c) => c.id === "start-fresh");
    expect(startFresh?.description).toContain("kept");
  });

  it("never leaves the user without a way forward", () => {
    for (const state of ["found", "missing", "damaged"] as const) {
      const situation = describeProfileSituation({
        ...BASE,
        inspection: inspection({ state }),
      });
      expect(situation.choices.length, `${state} must offer at least one choice`).toBeGreaterThan(0);
      expect(situation.headline.length).toBeGreaterThan(0);
      expect(situation.detail.length).toBeGreaterThan(0);
    }
  });

  it("honours what the caller can actually do", () => {
    const limited = describeProfileSituation({
      ...BASE,
      inspection: inspection({ state: "missing" }),
      canCreate: false,
      canChooseFolder: true,
    });
    expect(limited.choices.map((c) => c.id)).toEqual(["choose-folder"]);

    const nothing = describeProfileSituation({
      ...BASE,
      inspection: inspection(),
      canCreate: false,
      canChooseFolder: false,
    });
    expect(nothing.choices.map((c) => c.id)).toEqual(["use"]);
  });

  it("keeps developer vocabulary out of the wording", () => {
    const jargon = ["profileDir", "undefined", "null", "schema", "JSON", "ENVOYMESH_", "sync"];
    for (const state of ["found", "missing", "damaged"] as const) {
      const situation = describeProfileSituation({ ...BASE, inspection: inspection({ state }) });
      const text = [situation.headline, situation.detail, ...situation.choices.flatMap((c) => [c.label, c.description])].join(" ");
      for (const word of jargon) {
        expect(text, `"${word}" leaked into the ${state} wording`).not.toContain(word);
      }
    }
  });
});
