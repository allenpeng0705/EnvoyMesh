/**
 * Product-store availability — the `profileDir` half of the §6.2 seam.
 *
 * ## Why this exists
 *
 * `human-profile-availability.ts` made `humanProfileStore` optional and showed
 * the pattern: a **typed error**, not a silent null-object, so that "this code
 * path still needs a product input" is *measured* rather than hidden.
 *
 * `profileDir` is the same shape of input and was still the real gate: it
 * conditions 29 store creations in the constructor, mixing core stores (trust,
 * peer directory, agent identity, device authorization) with product ones
 * (family profiles, family rooms, shop, market, commerce, social proxy, agent
 * circles, coding schedules). A host that is not EnvoyMesh social must still
 * supply one today, so construction is not yet product-free — and when it does
 * not, the constructor substitutes the magic path `/tmp/unknown`, which is a
 * directory that *exists* and gets written to.
 *
 * ## The two decisions this module records
 *
 * 1. **Absence is typed.** `hasProfileDir()` is the only test for "is there a
 *    configured profile directory"; no other module compares against the sentinel
 *    string. The sentinel stays as `UNCONFIGURED_PROFILE_DIR` because a few
 *    filesystem paths genuinely need *a* directory, but nothing branches on it.
 * 2. **A product store without a directory is unavailable, not empty.** It is
 *    constructed through `productStore()`, which returns the real store when a
 *    directory exists and a throwing proxy when it does not — the mirror of
 *    `createUnavailableHumanProfileStore`. A stub that silently returned empty
 *    results would let a bare kernel *look* like it had no product stores while
 *    the code still depended on them.
 *
 * Plan: `docs/envoymesh-refactoring-plan.md` §8.9 (kernel decomposition) and
 * §8.17.5 (this step).
 */

/** The path the node uses when no profile directory is configured. */
export const UNCONFIGURED_PROFILE_DIR = "/tmp/unknown";

/** True when a real profile directory was supplied. */
export function hasProfileDir(dir: string | null | undefined): dir is string {
  return typeof dir === "string" && dir.length > 0 && dir !== UNCONFIGURED_PROFILE_DIR;
}

export const PRODUCT_STORE_UNAVAILABLE_CODE = "product_store_unavailable";

/**
 * Raised when a product store is used on a host that supplied no profile
 * directory. The `store` field names *which* store, so a probe or a log line
 * reports the extraction target rather than "something failed".
 */
export class ProductStoreUnavailableError extends Error {
  readonly code = PRODUCT_STORE_UNAVAILABLE_CODE;
  readonly store: string;
  constructor(store: string, detail?: string) {
    super(
      `The ${store} store is unavailable: this node was started without a profile directory, ` +
        `so the product stores behind it were not created.${detail ? ` (${detail})` : ""}`,
    );
    this.name = "ProductStoreUnavailableError";
    this.store = store;
  }
}

export function isProductStoreUnavailable(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { code?: string }).code === PRODUCT_STORE_UNAVAILABLE_CODE
  );
}

/**
 * A stand-in for a product store on a host without a profile directory.
 *
 * Every property access throws, which is the point: a caller that *uses* the
 * store fails with a typed, nameable error naming the store, while merely
 * holding a reference (a field assignment, a `stop()`/teardown that checks for
 * a method) does not. Symbol and `then` accesses are exempt so logging,
 * `await`, and inspection do not explode confusingly.
 */
export function createUnavailableProductStore<T extends object>(store: string): T {
  const label = `[unavailable product store: ${store}]`;
  return new Proxy({} as T, {
    get(_target, prop) {
      if (typeof prop === "symbol") {
        // `nodejs.util.inspect.custom` and friends: make logs readable rather
        // than explosive. Inspection is not use.
        return prop === Symbol.for("nodejs.util.inspect.custom") ? () => label : undefined;
      }
      if (prop === "then") return undefined; // `await store` must not throw
      if (prop === "constructor") return Object;
      // Inspection/serialisation is safe *and informative* — a log line saying
      // "unavailable product store: _shopStore" is exactly what a bare kernel
      // should print. Everything else throws: that is the seam.
      if (prop === "toString") return () => label;
      if (prop === "toJSON") return () => ({ unavailable: store });
      throw new ProductStoreUnavailableError(store);
    },
    set() {
      throw new ProductStoreUnavailableError(store);
    },
    has() {
      return true;
    },
  });
}

/**
 * Construct a product store when a profile directory exists, and the typed
 * unavailable stand-in when it does not.
 *
 * `name` is the store's human name and appears verbatim in the error, so it is
 * worth passing the class or field name (`"_familyProfileStore"`).
 */
export function productStore<T extends object>(
  profileDir: string | null | undefined,
  name: string,
  make: (dir: string) => T,
): T {
  return hasProfileDir(profileDir) ? make(profileDir) : createUnavailableProductStore<T>(name);
}
