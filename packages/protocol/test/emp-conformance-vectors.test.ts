/**
 * EMP signed-envelope conformance vectors for third-party CI.
 * Fixtures: packages/protocol/test/fixtures/emp-conformance/
 * Regenerate: npm run generate-conformance-vectors -w @envoymesh/protocol
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  signCanonicalPayload,
  verifyAgentEnvelope,
  verifyEnvelope,
  verifyInboundEnvelope,
} from "@envoymesh/identity";
import {
  parseChatMessagePayload,
  parseKnowledgeQueryPayload,
  parseKnowledgeResponsePayload,
  parseShareRequestPayload,
  type EnvoyEnvelope,
} from "@envoymesh/protocol";
import { describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixtureDir = join(__dirname, "fixtures/emp-conformance");

type ConformanceVector = {
  id: string;
  description: string;
  intent: string;
  publicKeyPem: string;
  peerId: string;
  unsignedEnvelopeJson: Record<string, unknown>;
  signatureBase64Url: string;
  signedEnvelopeJson: Record<string, unknown>;
};

type Manifest = {
  version: string;
  vectors: Array<{ id: string; file: string; intent: string; description: string }>;
};

function loadVector(file: string): ConformanceVector {
  return JSON.parse(readFileSync(join(fixtureDir, file), "utf8")) as ConformanceVector;
}

const manifest = JSON.parse(readFileSync(join(fixtureDir, "manifest.json"), "utf8")) as Manifest;

describe("EMP conformance vectors (emp/0.1)", () => {
  it("manifest lists all fixture files", () => {
    expect(manifest.version).toBe("emp/0.1");
    expect(manifest.vectors.length).toBeGreaterThanOrEqual(6);
  });

  for (const entry of manifest.vectors) {
    describe(entry.id, () => {
      const vector = loadVector(entry.file);

      it("reproduces committed signature from unsigned envelope", () => {
        const keys = JSON.parse(readFileSync(join(fixtureDir, "keys.json"), "utf8")) as {
          device: { privateKeyPem: string };
          agent: { privateKeyPem: string };
        };
        const privateKeyPem =
          vector.id === "chat-message-agent" ? keys.agent.privateKeyPem : keys.device.privateKeyPem;
        const sig = signCanonicalPayload(vector.unsignedEnvelopeJson, privateKeyPem);
        expect(sig).toBe(vector.signatureBase64Url);
      });

      it("signed envelope verifies (verifyEnvelope + verifyInboundEnvelope)", () => {
        const envelope = vector.signedEnvelopeJson as EnvoyEnvelope;
        if (vector.id === "chat-message-agent") {
          expect(verifyAgentEnvelope(envelope)).toBe(true);
        } else {
          expect(verifyEnvelope(envelope)).toBe(true);
        }
        expect(verifyInboundEnvelope(envelope)).toBe(true);
      });

      it("payload parses with intent-specific schema", () => {
        const envelope = vector.signedEnvelopeJson as EnvoyEnvelope;
        switch (vector.intent) {
          case "knowledge.query":
            expect(parseKnowledgeQueryPayload(envelope.payload).query).toContain("Document acquisition");
            break;
          case "knowledge.response": {
            const payload = parseKnowledgeResponsePayload(envelope.payload);
            expect(payload.suggestedRelativePath).toBe("shared/q3-revenue.pdf");
            expect(payload.answer).toBeTruthy();
            break;
          }
          case "share.request": {
            const payload = parseShareRequestPayload(envelope.payload);
            expect(payload.relativePath).toBe("shared/q3-revenue.pdf");
            expect(payload.requestType).toBe("file");
            break;
          }
          case "chat.message": {
            const payload = parseChatMessagePayload(envelope.payload);
            expect(payload.text.length).toBeGreaterThan(0);
            if (vector.id === "chat-message-agent") {
              expect(verifyAgentEnvelope(envelope)).toBe(true);
            }
            break;
          }
          case "system.ping":
            expect((envelope.payload as { message?: string }).message).toBe("emp-conformance-ping");
            break;
          default:
            throw new Error(`no payload parser test for intent ${vector.intent}`);
        }
      });
    });
  }
});
