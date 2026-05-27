import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  parseExternalDidDocumentJson,
  resolveDidImportInput,
  verifyDidKeyMatchesPublicKeyPem,
} from "../src/did-import.js";
import { buildOwnerDidPresentation } from "../src/owner-did-presentation.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

describe("did-import", () => {
  const golden = JSON.parse(
    readFileSync(join(__dirname, "../../identity/test/fixtures/companion_identity_golden.json"), "utf8"),
  ) as { publicKeyPem: string; ownerId: string };

  it("resolves did:key to owner id and PEM", () => {
    const presentation = buildOwnerDidPresentation({
      ownerId: golden.ownerId,
      publicKeyPem: golden.publicKeyPem,
    });
    const result = resolveDidImportInput(presentation.did);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.resolved.ownerId).toBe(golden.ownerId);
    expect(verifyDidKeyMatchesPublicKeyPem(presentation.did, result.resolved.publicKeyPem)).toBe(true);
  });

  it("parses exported DID document JSON", () => {
    const presentation = buildOwnerDidPresentation({
      ownerId: golden.ownerId,
      publicKeyPem: golden.publicKeyPem,
    });
    const result = parseExternalDidDocumentJson(JSON.stringify(presentation.document));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.resolved.did).toBe(presentation.did);
    expect(result.resolved.ownerId).toBe(golden.ownerId);
  });

  it("rejects envoy:owner id without public key material", () => {
    const result = resolveDidImportInput("envoy:owner:abc");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain("public key");
  });
});
