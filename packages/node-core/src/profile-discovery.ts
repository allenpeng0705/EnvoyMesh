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
 * Design: `docs/envoymesh-multi-product-design.md` §6 — the five-state flow, of
 * which four are reachable without the lock S3 adds.
 *
 * This module builds a **description**, not a dialog: a product's UI renders it
 * (S2's remaining half is that rendering). Nothing here decides *policy* — the
 * caller passes which options it can actually honour.
 */

import type { ProfileInspection, ProfileState } from "./envoymesh-home.js";

/** What a user can choose. Product UIs map these onto buttons. */
export type ProfileChoiceId = "use" | "create" | "choose-folder" | "start-fresh";

export interface ProfileChoice {
  id: ProfileChoiceId;
  /** Button text. */
  label: string;
  /** One line under the button, said to the user, not to a developer. */
  description: string;
  /** Marks the choice this module would make for a typical user. */
  recommended?: boolean;
}

export interface ProfileSituation {
  state: ProfileState;
  home: string;
  profileDir: string;
  /** One sentence answering "what did you find?" */
  headline: string;
  /** One or two sentences answering "which profile is it, and where?" */
  detail: string;
  /** What the user can do, in order. */
  choices: ProfileChoice[];
}

export interface DescribeProfileSituationInput {
  /** The product asking, e.g. `"EnvoyCoder"` — used in the wording only. */
  product: string;
  home: string;
  profileDir: string;
  inspection: ProfileInspection;
  /** The app that last touched this home (`marker.lastUsedBy.app`), when known. */
  lastUsedByApp?: string;
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

function damageSummary(inspection: ProfileInspection): string {
  // Two items read as "A and B", three or more as "A, B and C" — "A, and B" is the
  // kind of thing that makes a product feel machine-written.
  const list = (items: string[]): string =>
    items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;

  const parts: string[] = [];
  if (inspection.missing.length > 0) {
    parts.push(`some files are missing (${list(inspection.missing)})`);
  }
  if (inspection.unreadable.length > 0) {
    parts.push(`some files cannot be read (${list(inspection.unreadable)})`);
  }
  return list(parts);
}

/**
 * Build the situation for a profile directory that was just inspected.
 *
 * Every state yields at least one choice, and none of them ever proposes to
 * delete anything: a damaged or unexpected profile is left exactly where it is,
 * because those files *are* the user's identity.
 */
export function describeProfileSituation(input: DescribeProfileSituationInput): ProfileSituation {
  const { product, home, profileDir, inspection } = input;
  const canCreate = input.canCreate ?? true;
  const canChooseFolder = input.canChooseFolder ?? true;
  const owner = describeOwner(inspection);
  const lastApp = input.lastUsedByApp?.trim();
  const usedBy = lastApp && lastApp !== product ? ` It was last used by ${lastApp}.` : "";

  const chooseFolder: ProfileChoice = {
    id: "choose-folder",
    label: "Choose a different folder",
    description: "Pick where your profile should live, for example another drive.",
  };

  if (inspection.state === "found") {
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
      choices: [
        {
          id: "use",
          label: "Use this profile",
          description: "Keep your existing contacts, messages and files.",
          recommended: true,
        },
        ...(canCreate
          ? [
              {
                id: "create" as const,
                label: "Create a new profile",
                description:
                  "Start over with a new identity. The existing profile is left untouched.",
              },
            ]
          : []),
        ...(canChooseFolder ? [chooseFolder] : []),
      ],
    };
  }

  if (inspection.state === "damaged") {
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
        `another folder, or start a new profile here.`,
      choices: [
        ...(canChooseFolder
          ? [{ ...chooseFolder, description: "Use a backup or another profile you already have.", recommended: true }]
          : []),
        ...(canCreate
          ? [
              {
                id: "start-fresh" as const,
                label: "Start a new profile here",
                description:
                  "The incomplete files are kept, but a new identity is created beside them.",
              },
            ]
          : []),
      ],
    };
  }

  // state === "missing"
  return {
    state: "missing",
    home,
    profileDir,
    headline: "No profile was found, so a new one will be created.",
    detail: `Your new profile will be stored in ${quotePath(profileDir)}.`,
    choices: [
      ...(canCreate
        ? [
            {
              id: "create" as const,
              label: "Create my profile",
              description: `Set up a new identity for ${product} on this computer.`,
              recommended: true,
            },
          ]
        : []),
      ...(canChooseFolder ? [chooseFolder] : []),
    ],
  };
}
