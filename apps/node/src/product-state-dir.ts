/**
 * §5 — which directory this product's state belongs in.
 *
 * ## The decision
 *
 * The shared profile directory (`<home>/profile/`) holds **identity and the 14 kernel
 * stores**: the owner key, the peer key, trust, peer directory, session tokens, node
 * config, the audit trail, the vault index. A product's own state — chat transcripts,
 * family profiles, shop listings, published library, harness sessions, coding schedules —
 * belongs under `<home>/<product>/`, so that installing EnvoyDev does not mean reading
 * EnvoyMesh's chats (`docs/envoymesh-multi-product-design.md` §5).
 *
 * Two directories, then, and this module is the only place that decides the second one:
 *
 *   * `profileDir` — kernel. Passed to identity, trust, config, audit, vault/RAG, and the
 *     model engine (whose assets are `<home>/runtime/`, §8).
 *   * `productDir` — everything the *product* writes. `this._productDir` in the service,
 *     `requireProductStoreDir` / `productStore` at the store constructions.
 *
 * ## Adoption, and why it is not a migration
 *
 * Every install that exists today keeps its product state *inside* `profile/`. Moving it is
 * a data migration, and doing that silently inside a version upgrade is how a user loses
 * their chat history. So this **resolves** instead of moving: if the profile directory
 * already holds product state, that directory *is* the product directory —
 * `adoptedLegacy: true` — and every call site that switched to `productDir` is a no-op for
 * that install, because the two strings are equal.
 *
 * The consequence worth stating plainly: for an existing install this change cannot alter
 * behaviour, and for a fresh one it decides the layout. That asymmetry is why the switch is
 * safe to make call site by call site, and why `profileDirHasProductState` is written to
 * err towards adopting (see its doc comment).
 */

import * as path from "node:path";
import { DEFAULT_APP_NAME, resolveAppName } from "@envoymesh/protocol";
import {
  homeForProfileDir,
  profileDirHasProductState,
  resolveProductStateDir,
} from "@envoymesh/node-core";
import { UNCONFIGURED_PROFILE_DIR, hasProfileDir } from "./product-store-availability.js";

export interface ProductStateDir {
  /** The directory this product's stores and feature files must use. */
  dir: string;
  /** The product name that decided it (`EnvoyMesh`, or `ENVOYMESH_APP_NAME`). */
  product: string;
  /**
   * How the directory was decided. Reported at boot; the distinction matters because a
   * "split" layout is the only one where two roots exist.
   *
   *   * `split` — the normal fresh install: `<home>/profile` for the kernel, `<home>/<product>`
   *     for this product's state.
   *   * `adopted` — an existing install whose product state is already inside `profile/`;
   *     kept there, so every product-store switch is a no-op.
   *   * `standalone` — the profile is not `<home>/profile` (an explicit `ENVOYMESH_PROFILE`,
   *     or an old checkout's `./data/default`). The user pointed the node at one directory,
   *     so that directory is the whole root and product state stays in it.
   *   * `unconfigured` — no profile at all; the directory is the sentinel and the product
   *     stores are unavailable rather than writing somewhere real.
   */
  layout: "split" | "adopted" | "standalone" | "unconfigured";
  /** Kernel root, for the boot report's benefit. */
  profileDir: string;
}

/** True when an existing install's product state is kept where it already is. */
export function adoptedProductState(state: ProductStateDir): boolean {
  return state.layout === "adopted" || state.layout === "standalone";
}

/** The product this process *is* — `EnvoyMesh` unless a launcher says otherwise. */
export function currentProductName(env: NodeJS.ProcessEnv = process.env): string {
  return resolveAppName(env);
}

/**
 * Resolve the product state directory for a profile directory.
 *
 * An unconfigured host (no profile directory) gets the sentinel back, so the product stores
 * stay *unavailable* rather than silently writing to a real directory — the §6.2 seam, and
 * the reason this returns the sentinel instead of throwing.
 */
export function resolveProductStateDirFor(
  profileDir: string | null | undefined,
  product: string = currentProductName(),
): ProductStateDir {
  if (!hasProfileDir(profileDir)) {
    return { dir: UNCONFIGURED_PROFILE_DIR, product, layout: "unconfigured", profileDir: UNCONFIGURED_PROFILE_DIR };
  }
  const resolvedProfile = path.resolve(profileDir);
  const home = homeForProfileDir(resolvedProfile);
  // A profile that *is* its own home has nowhere to put `<home>/<product>` without nesting a
  // product directory inside the identity directory the user pointed at. Keeping both in one
  // place is what the user asked for, and it is also what every existing `ENVOYMESH_PROFILE`
  // and `./data/default` install does today.
  if (home === resolvedProfile) {
    return { dir: resolvedProfile, product, layout: "standalone", profileDir: resolvedProfile };
  }
  const resolved = resolveProductStateDir({
    home,
    product,
    legacyDir: resolvedProfile,
    legacyHasState: profileDirHasProductState(resolvedProfile),
  });
  return {
    dir: resolved.dir,
    product,
    layout: resolved.adoptedLegacy ? "adopted" : "split",
    profileDir: resolvedProfile,
  };
}

/** A one-line report for the boot log, in the node's existing `[home]` voice. */
export function describeProductStateDir(state: ProductStateDir): string {
  switch (state.layout) {
    case "adopted":
      return (
        `[home] product state: ${state.dir} (existing install — kept where it is; ` +
        `the shared profile holds both identity and product state)`
      );
    case "standalone":
      return (
        `[home] product state: ${state.dir} (single-directory profile — ` +
        `identity and product state share it)`
      );
    case "unconfigured":
      return "[home] product state: none (no profile directory configured)";
    default:
      return `[home] product state: ${state.dir} for ${state.product} (kernel in ${state.profileDir})`;
  }
}

export { DEFAULT_APP_NAME };
