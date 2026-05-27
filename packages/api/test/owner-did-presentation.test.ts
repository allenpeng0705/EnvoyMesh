import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  buildOwnerDidPresentation,
  deriveDidKeyFromEd25519PublicKey,
  ed25519RawPublicKeyFromSpkiPem,
  parseDidLookupInput,
} from "../src/owner-did-presentation.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

describe("owner-did-presentation", () => {
  it("derives stable did:key from companion golden public key", () => {
    const golden = JSON.parse(
      readFileSync(join(__dirname, "../../identity/test/fixtures/companion_identity_golden.json"), "utf8"),
    ) as { publicKeyPem: string; ownerId: string };

    const raw = ed25519RawPublicKeyFromSpkiPem(golden.publicKeyPem);
    expect(raw).toHaveLength(32);

    const presentation = buildOwnerDidPresentation({
      ownerId: golden.ownerId,
      publicKeyPem: golden.publicKeyPem,
    });

    expect(presentation.ownerId).toBe(golden.ownerId);
    expect(presentation.did).toMatch(/^did:key:z[1-9A-HJ-NP-Za-km-z]+$/);
    expect(presentation.did).toBe(deriveDidKeyFromEd25519PublicKey(raw));
    expect(presentation.document.alsoKnownAs).toEqual([golden.ownerId]);
    expect(presentation.document.verificationMethod[0]?.publicKeyMultibase).toBe(
      presentation.publicKeyMultibase,
    );

    // Snapshot: changing derivation breaks importers — update only intentionally.
    expect(presentation.did).toBe("did:key:z6MkkB2HWDMYsyJREtYvCFVSLxLut445cdQCWdrGEnYB97iF");
  });

  it("parseDidLookupInput accepts did:key and envoy:owner ids", () => {
    expect(parseDidLookupInput("")).toEqual({ kind: "invalid" });
    expect(parseDidLookupInput("envoy:owner:abc")).toEqual({
      kind: "envoy-owner",
      ownerId: "envoy:owner:abc",
    });
    expect(parseDidLookupInput("did:key:z6MkkB2HWDMYsyJREtYvCFVSLxLut445cdQCWdrGEnYB97iF")).toMatchObject({
      kind: "did-key",
      did: "did:key:z6MkkB2HWDMYsyJREtYvCFVSLxLut445cdQCWdrGEnYB97iF",
    });
    expect(parseDidLookupInput("did:web:example.com")).toEqual({ kind: "invalid" });
  });
});
