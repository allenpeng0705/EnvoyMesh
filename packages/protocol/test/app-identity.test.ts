/**
 * Which app a pairing code belongs to.
 *
 * This is the client-side half of "one app per pairing code": the node cannot refuse a
 * cross-app code (the token inside it is opaque and app-local), so the rule lives in
 * the shared, browser-safe package and every client applies the same one.
 */

import { describe, expect, it } from "vitest";
import { DEFAULT_APP_NAME, pairingAppMismatch, resolveAppName } from "../src/app-identity.js";

describe("resolveAppName", () => {
  it("defaults to EnvoyMesh — what every existing install already is", () => {
    expect(DEFAULT_APP_NAME).toBe("EnvoyMesh");
    expect(resolveAppName({})).toBe("EnvoyMesh");
    expect(resolveAppName({ ENVOYMESH_APP_NAME: "EnvoyCoder" })).toBe("EnvoyCoder");
    // A blank launcher value is not a name.
    expect(resolveAppName({ ENVOYMESH_APP_NAME: "   " })).toBe("EnvoyMesh");
  });
});

describe("pairingAppMismatch", () => {
  it("accepts its own app, and a code that predates the field", () => {
    expect(pairingAppMismatch("EnvoyMesh", "EnvoyMesh")).toBeNull();
    // Refusing these would break every QR already printed, and the phone still has to
    // authenticate afterwards.
    expect(pairingAppMismatch(undefined, "EnvoyMesh")).toBeNull();
    expect(pairingAppMismatch("  ", "EnvoyMesh")).toBeNull();
  });

  it("does not let a scanned code put arbitrary text in the dialog", () => {
    // The claimed name is untrusted: a crafted QR must not be able to smuggle control
    // characters or a novel into the sentence a user is asked to trust.
    const hostile = `${"x".repeat(200)}\u001b[31mEVIL`;
    const message = pairingAppMismatch(hostile, "EnvoyMesh");
    expect(message).toBeTruthy();
    expect(message).not.toContain("\u001b"); // no escape sequences
    // The *label* is capped (the surrounding sentence is fixed prose, so measuring the
    // whole message would only measure the template).
    expect(message).not.toMatch(/x{41,}/);
    expect(message).toContain("…");
  });

  it("refuses another app's code, with something a person can act on", () => {
    const message = pairingAppMismatch("EnvoyCoder", "EnvoyMesh");
    expect(message).toBeTruthy();
    expect(message).toContain("EnvoyCoder");
    expect(message).toContain("EnvoyMesh");
    expect(message).toMatch(/show its pairing code|install/i);
    // The user is the audience: no wire vocabulary.
    expect(message).not.toMatch(/mismatch|token|scope|app id/i);
  });
});
