/**
 * The conventions a second app and the node have to agree on.
 *
 * `product-attach.ts` holds the things that would otherwise be duplicated as string
 * literals on both sides — the attach method name, the `product:<Name>` scope encoding,
 * and which app a pairing code belongs to — so this file pins the parts where a
 * disagreement becomes a security or a compatibility bug:
 *
 *   * a product name becomes a scope key, a token record field and a log line, so it is
 *     validated rather than trimmed-and-hoped-for;
 *   * a product scope must never be mistaken for a family profile id, because policy
 *     branches on exactly that;
 *   * a pairing code from another app is refused **with a sentence a user can act on**,
 *     while a code minted before the field existed keeps working.
 */

import { describe, expect, it } from "vitest";
import {
  DEFAULT_APP_NAME,
  isProductScope,
  isValidProductName,
  pairingAppMismatch,
  productFromScope,
  productScopeKey,
  resolveAppName,
} from "../src/product-attach.js";

describe("product scopes", () => {
  it("encodes and decodes a product name", () => {
    expect(productScopeKey("EnvoyCoder")).toBe("product:EnvoyCoder");
    expect(isProductScope("product:EnvoyCoder")).toBe(true);
    expect(productFromScope("product:EnvoyCoder")).toBe("EnvoyCoder");
  });

  it("is distinguishable from a family profile id", () => {
    for (const familyish of ["owner", "mom", "dad", "family:1"]) {
      expect(isProductScope(familyish), familyish).toBe(false);
      expect(productFromScope(familyish), familyish).toBeNull();
    }
    expect(isProductScope(undefined)).toBe(false);
    expect(productFromScope("product:")).toBeNull();
  });

  it("requires a usable product name", () => {
    expect(isValidProductName("EnvoyCoder")).toBe(true);
    expect(isValidProductName("Envoy Agent")).toBe(true);
    for (const bad of ["", "  ", "9lives", "a", "a/b", "-lead", "x".repeat(41)]) {
      expect(isValidProductName(bad), bad).toBe(false);
    }
    expect(isValidProductName(undefined)).toBe(false);
  });
});

describe("which app a pairing code belongs to", () => {
  it("accepts its own app, and a code that predates the field", () => {
    expect(pairingAppMismatch("EnvoyMesh", "EnvoyMesh")).toBeNull();
    // Codes minted before `app` existed must keep working: refusing them would break
    // every QR already printed, and the phone still has to authenticate afterwards.
    expect(pairingAppMismatch(undefined, "EnvoyMesh")).toBeNull();
    expect(pairingAppMismatch("  ", "EnvoyMesh")).toBeNull();
  });

  it("refuses another app's code, and says what to do about it", () => {
    const message = pairingAppMismatch("EnvoyCoder", "EnvoyMesh");
    expect(message).toBeTruthy();
    // End-user wording: the person holding the phone is the one who has to act.
    expect(message).toContain("EnvoyCoder");
    expect(message).toContain("EnvoyMesh");
    expect(message).toMatch(/show its pairing code|install/i);
    expect(message).not.toMatch(/mismatch|token|scope/i);
  });

  it("names the app from the environment, defaulting to EnvoyMesh", () => {
    expect(resolveAppName({})).toBe("EnvoyMesh");
    expect(resolveAppName({ ENVOYMESH_APP_NAME: "EnvoyCoder" })).toBe("EnvoyCoder");
    expect(resolveAppName({ ENVOYMESH_APP_NAME: "  " })).toBe("EnvoyMesh");
    // The default is what every existing install already is.
    expect(DEFAULT_APP_NAME).toBe("EnvoyMesh");
  });
});
