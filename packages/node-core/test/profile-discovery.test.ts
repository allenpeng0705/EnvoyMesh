/**
 * The discovery model — what a product tells the user, and what they can choose.
 *
 * Two things are asserted here that a UI cannot: that **every** combination of
 * state and caller capability leaves the user a way forward (the first version of
 * this file checked only the defaults and so passed while `missing` +
 * `canCreate: false` + `canChooseFolder: false` produced an empty choice list),
 * and that the wording stays end-user-readable — no developer vocabulary, and no
 * headline promising something the choices do not offer.
 *
 * Design: `docs/envoymesh-multi-product-design.md` §6.
 */

import { describe, expect, it } from "vitest";
import { describeProfileSituation } from "../src/profile-discovery.js";
import type { EnvoyMeshHomeMarker, ProfileInspection, ProfileState } from "../src/envoymesh-home.js";

const NOW = new Date("2026-09-13T12:00:00.000Z");
const DIR = "/Users/alice/Library/Application Support/EnvoyMesh/profile";

function inspection(over: Partial<ProfileInspection> = {}): ProfileInspection {
  return {
    state: "found",
    dir: DIR,
    missing: [],
    unreadable: [],
    ownerId: "envoy:owner:9b2f4c1a7e33",
    displayName: "Alice",
    deviceId: "envoy:device:7c1f",
    ...over,
  };
}

function marker(over: Partial<EnvoyMeshHomeMarker> = {}): EnvoyMeshHomeMarker {
  return {
    schema: 1,
    createdAt: "2026-08-01T10:00:00.000Z",
    ownerId: "envoy:owner:9b2f4c1a7e33",
    lastUsedBy: { app: "EnvoyMesh", version: "0.5.0", at: "2026-09-12T09:00:00.000Z" },
    ...over,
  };
}

const BASE = {
  product: "EnvoyCoder",
  home: "/Users/alice/Library/Application Support/EnvoyMesh",
  profileDir: DIR,
  now: NOW,
};

describe("describeProfileSituation", () => {
  it("offers to use a found profile, and says whose it is", () => {
    const situation = describeProfileSituation({ ...BASE, inspection: inspection() });
    expect(situation.state).toBe("found");
    expect(situation.headline).toContain("Alice");
    expect(situation.detail).toContain("contacts and files stay the same");
    expect(situation.choices.map((c) => c.id)).toEqual(["use", "create", "choose-folder"]);
    expect(situation.choices.find((c) => c.id === "use")?.recommended).toBe(true);
    // Creating a second identity is never what we suggest to someone who has one.
    expect(situation.choices.find((c) => c.id === "create")?.recommended).toBeFalsy();
  });

  it("names the app that last used the profile, unless the product is that app", () => {
    const withMarker = describeProfileSituation({
      ...BASE,
      inspection: inspection(),
      marker: marker(),
    });
    expect(withMarker.detail).toContain("last used by EnvoyMesh");

    const sameProduct = describeProfileSituation({
      ...BASE,
      product: "EnvoyMesh",
      inspection: inspection(),
      marker: marker(),
    });
    expect(sameProduct.detail).not.toContain("last used by");
    // …but the fact block still says it, because that is where detail belongs.
    expect(sameProduct.facts.find((f) => f.label === "Last used")?.value).toContain("EnvoyMesh");
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

  it("reports when the profile was created and last used, in the user's terms", () => {
    const situation = describeProfileSituation({
      ...BASE,
      inspection: inspection(),
      // Created eight days before "now" → "last week", so this test exercises a
      // relative phrase rather than a hardcoded date (the ladder has its own test).
      marker: marker({ createdAt: "2026-09-05T12:00:00.000Z" }),
    });
    const byLabel = (label: string) => situation.facts.find((f) => f.label === label)?.value;
    expect(byLabel("Owner")).toBe("Alice");
    expect(byLabel("Stored in")).toBe(DIR);
    expect(byLabel("Created")).toBe("last week");
    expect(byLabel("Last used")).toBe("yesterday by EnvoyMesh 0.5.0");
    expect(byLabel("Device")).toBe("envoy:device:7c1f");
  });

  it("phrases the age of the profile the way a person would", () => {
    const at = (iso: string) => {
      const facts = describeProfileSituation({
        ...BASE,
        inspection: inspection(),
        marker: marker({ createdAt: iso }),
      }).facts;
      return facts.find((f) => f.label === "Created")?.value;
    };
    expect(at("2026-09-13T08:00:00.000Z")).toBe("today");
    expect(at("2026-09-12T08:00:00.000Z")).toBe("yesterday");
    expect(at("2026-09-10T08:00:00.000Z")).toBe("3 days ago");
    expect(at("2026-09-05T08:00:00.000Z")).toBe("last week");
    expect(at("2026-06-05T08:00:00.000Z")).toContain("2026");
    // A marker with junk in it must not produce "Invalid Date" for a user to read.
    expect(at("not a date")).toBeUndefined();
  });

  it("says a profile will be created when there is none, and keeps headline and choices in step", () => {
    const situation = describeProfileSituation({
      ...BASE,
      inspection: inspection({ state: "missing", ownerId: undefined, displayName: undefined }),
    });
    expect(situation.headline).toMatch(/no profile/i);
    expect(situation.choices.find((c) => c.id === "create")?.recommended).toBe(true);

    // The bug this replaced: the headline promised a new profile while the caller
    // could not create one, so the words contradicted the buttons.
    const cannotCreate = describeProfileSituation({
      ...BASE,
      inspection: inspection({ state: "missing", ownerId: undefined, displayName: undefined }),
      canCreate: false,
    });
    expect(cannotCreate.headline).not.toMatch(/will be created/i);
    expect(cannotCreate.choices.map((c) => c.id)).not.toContain("create");
  });

  it("reports a damaged profile, naming what is wrong, and never offers to delete it", () => {
    const situation = describeProfileSituation({
      ...BASE,
      inspection: inspection({ state: "damaged", missing: ["libp2p-private.key"] }),
    });
    expect(situation.detail).toContain("libp2p-private.key");
    expect(situation.detail).toContain("Nothing has been changed");
    expect(situation.choices.map((c) => c.id)).not.toContain("delete");
    expect(situation.choices.find((c) => c.id === "choose-folder")?.recommended).toBe(true);
    const startFresh = situation.choices.find((c) => c.id === "start-fresh");
    expect(startFresh?.description).toContain("kept");
    // A UI must confirm it, so the model has to say so.
    expect(startFresh?.destructive).toBe(true);
  });

  it("lists two damaged things the way a person would", () => {
    const situation = describeProfileSituation({
      ...BASE,
      inspection: inspection({
        state: "damaged",
        missing: ["human-profile.json"],
        unreadable: ["profile.json"],
      }),
    });
    expect(situation.detail).toContain(
      "some files are missing (human-profile.json) and some files cannot be read (profile.json)",
    );
    expect(situation.detail).not.toContain(", and");
  });

  it("always leaves the user a way forward, in every state and capability combination", () => {
    const states: ProfileState[] = ["found", "missing", "damaged"];
    for (const state of states) {
      for (const canCreate of [true, false]) {
        for (const canChooseFolder of [true, false]) {
          const situation = describeProfileSituation({
            ...BASE,
            inspection: inspection({ state, ...(state === "found" ? {} : { ownerId: undefined, displayName: undefined }) }),
            canCreate,
            canChooseFolder,
          });
          const label = `${state} (create=${canCreate}, folder=${canChooseFolder})`;
          expect(situation.choices.length, `${label} must offer at least one choice`).toBeGreaterThan(0);
          expect(situation.headline.length, label).toBeGreaterThan(0);
          expect(situation.detail.length, label).toBeGreaterThan(0);
          // Nothing offered may be a delete, and "Not now" is the only fallback.
          for (const choice of situation.choices) {
            expect(choice.id, label).not.toBe("delete" as never);
            expect(choice.label.length, label).toBeGreaterThan(0);
            expect(choice.description.length, label).toBeGreaterThan(0);
            expect(choice.destructive === undefined || choice.destructive === true, label).toBe(true);
          }
          // At most one recommendation: a dialog with two "recommended" buttons is
          // no recommendation at all.
          expect(situation.choices.filter((c) => c.recommended).length, label).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it("says who is using the home right now, and offers only what is safe", () => {
    // The fifth state (design §6, state 4). Two apps on one home would claim one
    // identity between them, so "connect to it" and "use another folder" are the
    // only honest choices — starting a second copy is not among them.
    const situation = describeProfileSituation({
      ...BASE,
      inspection: inspection(),
      inUse: { app: "EnvoyMesh", pid: 1234, port: 3030, startedAt: "2026-09-13T09:00:00.000Z" },
    });
    expect(situation.state).toBe("in-use");
    expect(situation.headline).toContain("EnvoyMesh is already using this profile");
    expect(situation.detail).toContain("compete for the same identity");
    expect(situation.detail).toContain("today");
    expect(situation.choices.map((c) => c.id)).toEqual(["choose-folder"]);
    expect(situation.choices.map((c) => c.id)).not.toContain("use");
    expect(situation.choices.map((c) => c.id)).not.toContain("create");
  });

  it("offers to connect to the running node only when the caller can", () => {
    const attachable = describeProfileSituation({
      ...BASE,
      inspection: inspection(),
      inUse: { app: "EnvoyMesh", pid: 1234, port: 3030 },
      canAttach: true,
    });
    expect(attachable.choices.map((c) => c.id)).toEqual(["attach", "choose-folder"]);
    expect(attachable.choices.find((c) => c.id === "attach")?.recommended).toBe(true);
  });

  it("reports an in-use home even when nothing else can be done", () => {
    const situation = describeProfileSituation({
      ...BASE,
      inspection: inspection(),
      inUse: { app: "EnvoyMesh", pid: 1234 },
      canAttach: false,
      canChooseFolder: false,
    });
    expect(situation.choices.map((c) => c.id)).toEqual(["quit"]);
  });

  it("keeps developer vocabulary out of the wording", () => {
    // Deliberately narrow: a ban on arbitrary words fails on unrelated edits, and
    // a test that fails for the wrong reason gets deleted instead of fixed.
    const jargon = ["profileDir", "undefined", "envoy:owner:", "ENVOYMESH_", "schema"];
    for (const state of ["found", "missing", "damaged"] as const) {
      const situation = describeProfileSituation({
        ...BASE,
        inspection: inspection({ state }),
        marker: marker(),
      });
      const text = [
        situation.headline,
        situation.detail,
        ...situation.choices.flatMap((c) => [c.label, c.description]),
      ].join(" ");
      for (const word of jargon) {
        expect(text, `"${word}" leaked into the ${state} wording`).not.toContain(word);
      }
      // Facts are supporting detail and may name an id, but never a variable name.
      const factsText = situation.facts.map((f) => `${f.label} ${f.value}`).join(" ");
      expect(factsText).not.toContain("profileDir");
    }
  });
});
