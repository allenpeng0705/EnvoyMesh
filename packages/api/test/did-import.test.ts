import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  exportDidDocumentJson,
  parseExternalDidDocumentJson,
  resolveDidExportInput,
  resolveDidImportInput,
  validateDidServices,
  verifyDidKeyMatchesPublicKeyPem,
} from "../src/did-import.js";
import {
  buildOwnerDidPresentation,
  type DidServiceEndpoint,
} from "../src/owner-did-presentation.js";

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

  it("buildOwnerDidPresentation includes service endpoints when provided", () => {
    const services: DidServiceEndpoint[] = [
      {
        id: "#envoy-relay",
        type: "EnvoyMeshRelay",
        serviceEndpoint: "wss://relay.example.com:443",
        description: "WebSocket relay",
      },
      {
        id: "#envoy-agent",
        type: "EnvoyMeshAgent",
        serviceEndpoint: "envoy_agent_abc123",
      },
    ];
    const presentation = buildOwnerDidPresentation({
      ownerId: golden.ownerId,
      publicKeyPem: golden.publicKeyPem,
      services,
    });
    expect(presentation.document.service).toEqual(services);
  });

  it("buildOwnerDidPresentation omits service when none provided", () => {
    const presentation = buildOwnerDidPresentation({
      ownerId: golden.ownerId,
      publicKeyPem: golden.publicKeyPem,
    });
    expect(presentation.document.service).toBeUndefined();
  });
});

describe("did-export round-trip", () => {
  const golden = JSON.parse(
    readFileSync(join(__dirname, "../../identity/test/fixtures/companion_identity_golden.json"), "utf8"),
  ) as { publicKeyPem: string; ownerId: string };

  const services: DidServiceEndpoint[] = [
    {
      id: "#envoy-relay",
      type: "EnvoyMeshRelay",
      serviceEndpoint: "wss://relay.example.com:443",
    },
    {
      id: "#envoy-agent",
      type: "EnvoyMeshAgent",
      serviceEndpoint: "envoy_agent_abc123",
    },
  ];

  it("exportDidDocumentJson produces envelope-wrapped JSON", () => {
    const exported = exportDidDocumentJson({
      ownerId: golden.ownerId,
      publicKeyPem: golden.publicKeyPem,
      services,
    });
    expect(exported.envelope).toBe("envoymesh-did-export-v1");
    expect(exported.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(exported.did).toMatch(/^did:key:z/);
    expect(exported.ownerId).toBe(golden.ownerId);
    expect(exported.publicKeyPem).toBe(golden.publicKeyPem);
    expect(exported.document.service).toEqual(services);
  });

  it("export → resolve round-trip preserves did, ownerId, and services", () => {
    const exported = exportDidDocumentJson({
      ownerId: golden.ownerId,
      publicKeyPem: golden.publicKeyPem,
      services,
    });
    const raw = JSON.stringify(exported);
    const resolved = resolveDidExportInput(raw);
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.resolved.did).toBe(exported.did);
    expect(resolved.resolved.ownerId).toBe(exported.ownerId);
    expect(resolved.resolved.publicKeyPem).toBe(exported.publicKeyPem);
    expect(resolved.resolved.exportedAt).toBe(exported.exportedAt);
    expect(resolved.resolved.services).toEqual(services);
  });

  it("rejects non-EnvoyMesh JSON (wrong envelope)", () => {
    const wrong = JSON.stringify({ envelope: "other-v1", did: "did:key:zabc" });
    const resolved = resolveDidExportInput(wrong);
    expect(resolved.ok).toBe(false);
    if (resolved.ok) return;
    expect(resolved.reason).toContain("not an EnvoyMesh");
  });

  it("rejects invalid JSON", () => {
    const resolved = resolveDidExportInput("not json at all");
    expect(resolved.ok).toBe(false);
    if (resolved.ok) return;
    expect(resolved.reason).toContain("invalid JSON");
  });

  it("rejects did:key / ownerId mismatch in export", () => {
    const presentation = buildOwnerDidPresentation({
      ownerId: golden.ownerId,
      publicKeyPem: golden.publicKeyPem,
    });
    const tampered = {
      envelope: "envoymesh-did-export-v1" as const,
      exportedAt: new Date().toISOString(),
      did: presentation.did,
      ownerId: "envoy:owner:different",
      publicKeyPem: golden.publicKeyPem,
      document: presentation.document,
    };
    const resolved = resolveDidExportInput(JSON.stringify(tampered));
    expect(resolved.ok).toBe(false);
    if (!resolved.ok) return;
    expect(resolved.reason).toContain("ownerId");
  });

  it("validateDidServices accepts well-formed array", () => {
    const result = validateDidServices(services);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.services).toEqual(services);
  });

  it("validateDidServices rejects non-array", () => {
    const result = validateDidServices("not an array");
    expect(result.ok).toBe(false);
  });

  it("validateDidServices rejects service missing id", () => {
    const result = validateDidServices([{ type: "x", serviceEndpoint: "y" }]);
    expect(result.ok).toBe(false);
  });

  it("validateDidServices rejects service id not starting with #", () => {
    const result = validateDidServices([{ id: "no-hash", type: "x", serviceEndpoint: "y" }]);
    expect(result.ok).toBe(false);
  });

  it("validateDidServices rejects service missing endpoint", () => {
    const result = validateDidServices([{ id: "#x", type: "EnvoyMeshRelay" }]);
    expect(result.ok).toBe(false);
  });
});
