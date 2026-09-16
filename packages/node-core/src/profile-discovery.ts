/**
 * What to tell the user about the profile on this machine, and what they can do
 * about it.
 *
 * ## Why this is separate from the resolution in `envoymesh-home.ts`
 *
 * Resolution answers "which directory"; this answers "what do we say, and what
 * are the choices". Keeping them apart is deliberate: the wording is the part the
 * owner will revise most, and the part that must not drift into developer
 * vocabulary. `AGENTS.md`: *"Every user-facing string must be end-user-readable …
 * Default = end-user first, developer second."* So the strings live here, in one
 * place, and a test asserts they stay free of paths-and-jargon leaking into the
 * headline.
 *
 * Design: `docs/envoymesh-multi-product-design.md` §6 — the five-state flow
 * (found / missing / damaged / in-use, plus the resolution that produces none of
 * them). All five are reachable now that `node-registry.ts` provides the lock.
 *
 * This module builds a **description**, not a dialog: a product's UI renders it.
 * Nothing here decides *policy* — the caller passes which options it can actually
 * honour — and nothing here touches the filesystem: `facts` is assembled from what
 * the caller already inspected, so the model stays testable without a disk.
 *
 * ## What a review of the first version found (all fixed here)
 *
 *   1. the design promises a dialog that shows when the profile was created and
 *      last used; the model exposed neither — it took only `lastUsedByApp` and
 *      dropped every timestamp;
 *   2. with `canCreate: false` the *missing* headline still announced "a new one
 *      will be created" while offering no such choice — the words contradicted
 *      the buttons;
 *   3. with both `canCreate` and `canChooseFolder` false, `missing` and `damaged`
 *      produced **no choices at all**: a dialog with no way forward, which is
 *      worse than no dialog. The test that was supposed to catch this used the
 *      defaults, so it passed for the wrong reason;
 *   4. "start a new profile here" was offered as an ordinary option although a UI
 *      must confirm it — the model now marks it `destructive`;
 *   5. the jargon test banned arbitrary words ("sync", "null") and would have
 *      failed on unrelated wording changes, which is how a useful test gets
 *      deleted instead of fixed.
 */

import type { EnvoyMeshHomeMarker, ProfileInspection, ProfileState } from "./envoymesh-home.js";

/**
 * The inspected states, plus **`in-use`** — which is not something an inspection
 * can report (the files may be perfectly healthy) but something only the lock can
 * (`node-registry.ts`). It is the fifth state of the design's flow (§6, state 4)
 * and the reason S2 could not be finished before S3 existed.
 */
export type ProfileSituationState = ProfileState | "in-use";

/** What the lock says about a home another process is holding. */
export interface ProfileInUse {
  /** The app holding it, e.g. `"EnvoyMesh"`. */
  app: string;
  pid: number;
  /** WebSocket port the holder serves on, when it published an endpoint. */
  port?: number;
  /** When the holder started, ISO. */
  startedAt?: string;
  /**
   * Whether the holder's endpoint answered `/health` naming the owner it claims
   * (`resolveRunningNode` → `status === "running"`). `false` means a live claim we
   * could not prove is serving — worth saying, because "close the app" is the wrong
   * advice if it has already stopped answering.
   */
  verified?: boolean;
}

/** What a user can choose. Product UIs map these onto buttons. */
export type ProfileChoiceId = "use" | "create" | "choose-folder" | "start-fresh" | "attach" | "quit";

export interface ProfileChoice {
  id: ProfileChoiceId;
  /** Button text. */
  label: string;
  /** One line under the button, said to the user, not to a developer. */
  description: string;
  /** Marks the choice this module would make for a typical user. */
  recommended?: boolean;
  /**
   * True when the choice changes what is on disk in a way the user should confirm
   * (creating a second identity beside an existing, incomplete one). A UI must ask
   * before running it; the model cannot enforce that, so it declares it.
   */
  destructive?: boolean;
}

/** A labelled detail a dialog can render as a "what is this?" block. */
export interface ProfileFact {
  label: string;
  value: string;
}

export interface ProfileSituation {
  state: ProfileSituationState;
  home: string;
  profileDir: string;
  /** One sentence answering "what did you find?" */
  headline: string;
  /** One or two sentences answering "which profile is it, and where?" */
  detail: string;
  /** Supporting detail: who, where, when. Safe to show; never the only thing shown. */
  facts: ProfileFact[];
  /** What the user can do, best first. Never empty. */
  choices: ProfileChoice[];
}

export interface DescribeProfileSituationInput {
  /** The product asking, e.g. `"EnvoyDev"` — used in the wording only. */
  product: string;
  home: string;
  profileDir: string;
  inspection: ProfileInspection;
  /** The home marker, when the caller has read it: carries who created it and when. */
  marker?: EnvoyMeshHomeMarker | null;
  /** Set when the home is held by another process right now (design §6, state 4). */
  inUse?: ProfileInUse | null;
  /** True when the caller can actually connect to a running node. */
  canAttach?: boolean;
  /** Fallback when no marker is available. */
  lastUsedByApp?: string;
  /** Injectable clock, so "yesterday" can be asserted instead of hoped for. */
  now?: Date;
  /** False when the caller cannot create a profile (e.g. a read-only root). */
  canCreate?: boolean;
  /** True when the caller can ask the OS for another folder. */
  canChooseFolder?: boolean;
}

function quotePath(p: string): string {
  return `\u201c${p}\u201d`;
}

/**
 * Name the owner without exposing internals: a display name if the human profile
 * has one, else the short owner id, else nothing at all.
 */
function describeOwner(inspection: ProfileInspection): string | null {
  const name = inspection.displayName?.trim();
  if (name) return name;
  const id = inspection.ownerId?.trim();
  if (!id) return null;
  // `envoy:owner:abc123…` → `abc123…`: the prefix is developer-facing.
  const short = id.replace(/^envoy:owner:/, "");
  return short.length > 12 ? `${short.slice(0, 12)}…` : short;
}

/** "today" / "yesterday" / "3 days ago" / "last week" / "March 2026". */
function describeWhen(iso: string | undefined, now: Date): string | null {
  if (!iso) return null;
  const then = new Date(iso);
  const thenMs = then.getTime();
  if (Number.isNaN(thenMs)) return null;
  const days = Math.floor((now.getTime() - thenMs) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 14) return "last week";
  if (days < 60) return `${Math.floor(days / 7)} weeks ago`;
  return then.toLocaleDateString(undefined, { year: "numeric", month: "long" });
}

/** `["a"]` → "a", `["a","b"]` → "a and b", `["a","b","c"]` → "a, b and c". */
function listPhrase(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

function damageSummary(inspection: ProfileInspection): string {
  const parts: string[] = [];
  if (inspection.missing.length > 0) {
    parts.push(`some files are missing (${listPhrase(inspection.missing)})`);
  }
  if (inspection.unreadable.length > 0) {
    parts.push(`some files cannot be read (${listPhrase(inspection.unreadable)})`);
  }
  return listPhrase(parts);
}

function buildFacts(input: DescribeProfileSituationInput, now: Date): ProfileFact[] {
  const { inspection, profileDir, marker } = input;
  const facts: ProfileFact[] = [];
  const owner = describeOwner(inspection);
  if (owner) facts.push({ label: "Owner", value: owner });
  facts.push({ label: "Stored in", value: profileDir });
  const created = describeWhen(marker?.createdAt, now);
  if (created) facts.push({ label: "Created", value: created });

  const usedApp = marker?.lastUsedBy?.app?.trim() ?? input.lastUsedByApp?.trim();
  if (usedApp) {
    const when = describeWhen(marker?.lastUsedBy?.at, now);
    const version = marker?.lastUsedBy?.version?.trim();
    facts.push({
      label: "Last used",
      value: [when, `by ${usedApp}${version ? ` ${version}` : ""}`].filter(Boolean).join(" "),
    });
  }
  if (inspection.deviceId) facts.push({ label: "Device", value: inspection.deviceId });
  return facts;
}

/**
 * Build the situation for a profile directory that was just inspected.
 *
 * Every state yields at least one choice — including the one where the caller can
 * neither create a profile nor pick another folder, which yields "Not now" rather
 * than an empty list. No choice ever deletes anything: a damaged or unexpected
 * profile is left exactly where it is, because those files *are* the user's
 * identity, and the one option that starts a second identity beside it is marked
 * `destructive`.
 */
export function describeProfileSituation(input: DescribeProfileSituationInput): ProfileSituation {
  const { product, home, profileDir, inspection } = input;
  const canCreate = input.canCreate ?? true;
  const canChooseFolder = input.canChooseFolder ?? true;
  const now = input.now ?? new Date();
  const owner = describeOwner(inspection);
  const lastApp = input.marker?.lastUsedBy?.app?.trim() ?? input.lastUsedByApp?.trim();
  const usedBy = lastApp && lastApp !== product ? ` It was last used by ${lastApp}.` : "";

  const facts = buildFacts(input, now);
  const chooseFolder: ProfileChoice = {
    id: "choose-folder",
    label: "Choose a different folder",
    description: "Pick where your profile should live, for example another drive.",
  };
  /** A dialog must never be a dead end. */
  const quit: ProfileChoice = {
    id: "quit",
    label: "Not now",
    description: "Close this and change nothing.",
  };

  // Held by another process: reported *before* the on-disk state, because "who has
  // it" is the user's first question and the answer changes what is safe to offer.
  // Two apps on one home would claim one identity between them, which is why the
  // only safe choices here are "connect to it" or "use a different folder".
  const inUse = input.inUse ?? null;
  if (inUse) {
    const choices: ProfileChoice[] = [];
    if (input.canAttach) {
      choices.push({
        id: "attach",
        label: `Use the running ${inUse.app}`,
        description: "Connect to it instead of starting a second copy.",
        recommended: true,
      });
    }
    if (canChooseFolder) {
      choices.push({
        ...chooseFolder,
        description: "Keep this profile for the app that is using it, and set up another one here.",
      });
    }
    const startedWhen = describeWhen(inUse.startedAt, now);
    return {
      state: "in-use",
      home,
      profileDir,
      headline: `${inUse.app} is already using this profile.`,
      detail:
        `Only one ${inUse.app} can use a profile at a time, because two copies would ` +
        `compete for the same identity.${startedWhen ? ` It started ${startedWhen}.` : ""} ` +
        // A live claim that is not answering is a different situation from a healthy
        // one, and "close it" would be poor advice: it may already be shutting down.
        (inUse.verified === false
          ? `It is not answering on${inUse.port ? ` port ${inUse.port}` : " its port"} right now, so it may be ` +
            `shutting down — try again in a moment, or use a different folder.`
          : `Close it, or use a different folder for ${product}.`),
      facts,
      choices: choices.length > 0 ? choices : [quit],
    };
  }

  if (inspection.state === "found") {
    const choices: ProfileChoice[] = [
      {
        id: "use",
        label: "Use this profile",
        description: "Keep your existing contacts, messages and files.",
        recommended: true,
      },
    ];
    if (canCreate) {
      choices.push({
        id: "create",
        label: "Create a new profile",
        description: "Start over with a new identity. The existing profile is left untouched.",
      });
    }
    if (canChooseFolder) choices.push(chooseFolder);
    return {
      state: "found",
      home,
      profileDir,
      headline: owner
        ? `A profile for ${owner} was found on this computer.`
        : "An existing profile was found on this computer.",
      detail:
        `${product} can use it, so your contacts and files stay the same.${usedBy} ` +
        `It is stored in ${quotePath(profileDir)}.`,
      facts,
      choices,
    };
  }

  if (inspection.state === "damaged") {
    const choices: ProfileChoice[] = [];
    if (canChooseFolder) {
      choices.push({
        ...chooseFolder,
        description: "Use a backup or another profile you already have.",
        recommended: true,
      });
    }
    if (canCreate) {
      choices.push({
        id: "start-fresh",
        label: "Start a new profile here",
        description: "The incomplete files are kept, but a new identity is created beside them.",
        destructive: true,
      });
    }
    return {
      state: "damaged",
      home,
      profileDir,
      headline: owner
        ? `The profile for ${owner} looks incomplete.`
        : "A profile here looks incomplete.",
      detail:
        `In ${quotePath(profileDir)}, ${damageSummary(inspection)}. ` +
        `Nothing has been changed. If you have a backup, restore it; otherwise choose ` +
        `another folder${canCreate ? ", or start a new profile here" : ""}.`,
      facts,
      choices: choices.length > 0 ? choices : [quit],
    };
  }

  // state === "missing"
  const choices: ProfileChoice[] = [];
  if (canCreate) {
    choices.push({
      id: "create",
      label: "Create my profile",
      description: `Set up a new identity for ${product} on this computer.`,
      recommended: true,
    });
  }
  if (canChooseFolder) choices.push(chooseFolder);
  return {
    state: "missing",
    home,
    profileDir,
    // The headline must match what can actually be done: it used to promise a new
    // profile would be created even when the caller could not create one.
    headline: canCreate
      ? "No profile was found, so a new one will be created."
      : "No profile was found here.",
    detail: canCreate
      ? `Your new profile will be stored in ${quotePath(profileDir)}.`
      : `Nothing here can be used as a profile yet. You can point ${product} at ` +
        `another folder, or set it up later.`,
    facts,
    choices: choices.length > 0 ? choices : [quit],
  };
}
