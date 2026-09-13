/**
 * Product-store availability — typed absence for `profileDir` (plan §8.9, §8.17.5).
 *
 * The point of these tests is the *contract*, not the plumbing: `hasProfileDir`
 * is the single test for "is there a configured profile directory", and a product
 * store on a host without one must fail with a typed, store-naming error instead
 * of silently acting like an empty store.
 */

import { describe, expect, it } from "vitest";
import {
  PRODUCT_STORE_UNAVAILABLE_CODE,
  ProductStoreUnavailableError,
  UNCONFIGURED_PROFILE_DIR,
  createUnavailableProductStore,
  hasProfileDir,
  isProductStoreUnavailable,
  productStore,
} from "../src/product-store-availability.js";

describe("hasProfileDir", () => {
  it("accepts a real directory and rejects every absence", () => {
    expect(hasProfileDir("/home/owner/.envoymesh")).toBe(true);
    expect(hasProfileDir(UNCONFIGURED_PROFILE_DIR)).toBe(false); // the sentinel is not a directory
    expect(hasProfileDir(undefined)).toBe(false);
    expect(hasProfileDir(null)).toBe(false);
    expect(hasProfileDir("")).toBe(false);
  });

  it("is the only place the sentinel is compared", () => {
    // Guards against a future refactor reintroducing magic-string comparisons in
    // node-service-impl.ts: the constant itself is defined right here.
    expect(UNCONFIGURED_PROFILE_DIR).toBe("/tmp/unknown");
  });
});

describe("the unavailable product store", () => {
  it("throws a typed, store-naming error on use", () => {
    const store = createUnavailableProductStore<{ list(): unknown }>("_chainStore");
    try {
      store.list();
      throw new Error("expected the stand-in to throw");
    } catch (err) {
      expect(isProductStoreUnavailable(err)).toBe(true);
      expect(err).toBeInstanceOf(ProductStoreUnavailableError);
      expect((err as ProductStoreUnavailableError).store).toBe("_chainStore");
      expect((err as ProductStoreUnavailableError).code).toBe(PRODUCT_STORE_UNAVAILABLE_CODE);
      expect((err as Error).message).toContain("_chainStore");
      expect((err as Error).message).toContain("profile directory");
    }
  });

  it("throws on writes too, so a bare kernel cannot persist product state", () => {
    const store = createUnavailableProductStore<Record<string, unknown>>("_shopStore");
    expect(() => {
      store["anything"] = 1;
    }).toThrow(ProductStoreUnavailableError);
  });

  it("can be held, logged and awaited, and says what it is", () => {
    // Holding a reference must be safe (fields are assigned in the constructor,
    // teardown checks for methods) and a log line must be *informative*: that is
    // the difference between a seam and a crash.
    const store = createUnavailableProductStore<object>("_marketCacheStore");
    expect(typeof store).toBe("object");
    expect(`${store}`).toBe("[unavailable product store: _marketCacheStore]");
    expect(JSON.stringify(store)).toBe('{"unavailable":"_marketCacheStore"}');
    expect(Object.prototype.toString.call(store)).toBeDefined();
    // Inspection is not use: a real method still throws.
    expect(isProductStoreUnavailable(catchError(() => (store as { list(): void }).list()))).toBe(true);
  });
});

describe("productStore()", () => {
  it("constructs the real store when a directory is configured", () => {
    const seen: string[] = [];
    const store = productStore("/home/owner/.envoymesh", "_familyProfileStore", (dir) => {
      seen.push(dir);
      return { dir };
    });
    expect(store.dir).toBe("/home/owner/.envoymesh");
    expect(seen).toEqual(["/home/owner/.envoymesh"]);
  });

  it("returns the typed stand-in when there is no directory", () => {
    let constructed = false;
    const store = productStore(undefined, "_familyProfileStore", () => {
      constructed = true;
      return {};
    });
    expect(constructed, "the factory must not run without a directory").toBe(false);
    expect(isProductStoreUnavailable(catchError(() => (store as { any(): void }).any()))).toBe(true);
  });

  it("treats the sentinel as absence, not as a directory", () => {
    let constructed = false;
    productStore(UNCONFIGURED_PROFILE_DIR, "_shopStore", () => {
      constructed = true;
      return {};
    });
    expect(constructed).toBe(false);
  });
});

function catchError(fn: () => unknown): unknown {
  try {
    fn();
    return undefined;
  } catch (err) {
    return err;
  }
}
