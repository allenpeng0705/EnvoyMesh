/**
 * Regenerate EMP signed-envelope conformance fixtures (test-only keys).
 * Run: npx tsx packages/protocol/scripts/generate-conformance-vectors.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createAgentCredential,
  signCanonicalPayload,
} from "@envoymesh/identity";
import {
  createChatMessagePayload,
  createKnowledgeQueryPayload,
  createKnowledgeResponsePayload,
  createShareRequestPayload,
  createUnsignedEnvelope,
} from "../src/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, "../test/fixtures/emp-conformance");

const devicePublicKeyPem =
  "-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAUhNuaolhhcAKfxHhMkT/Uzt1A5IDkO9GjwqhEmr8M68=\n-----END PUBLIC KEY-----\n";
const devicePrivateKeyPem =
  "-----BEGIN PRIVATE KEY-----\nMC4CAQAwBQYDK2VwBCIEIDebQoUrpXOw6RJJxZDpoJXtN9PEenAfOCzHyQWhlB7d\n-----END PRIVATE KEY-----\n";
const devicePeerId = "envoy_uv4I__vK5VBDR03aUicjwAQ_WjevFI1jzpziOk5ucZA";

const owner = {
  ownerId: "envoy:owner:WQfRO7SYFICX3vi-B2DUO44ak3j0hw9zi9GdECBrIpc",
  publicKeyPem:
    "-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAb7nIytIGMTriyWofOI5E2dNL1sRAze4iZaiZBhsn5hw=\n-----END PUBLIC KEY-----\n",
  privateKeyPem:
    "-----BEGIN PRIVATE KEY-----\nMC4CAQAwBQYDK2VwBCIEICBD6xnaxPYum3qr7wWgc1UI66RAZlMpPBfe6JjPmyIb\n-----END PRIVATE KEY-----\n",
};
const agent = {
  agentId: "envoy:agent:jJYKE6vCTsXpDu7CP_VRW0SNi356L15AmficK5eRubs",
  agentPeerId: "envoy_agent_jJYKE6vCTsXpDu7CP_VRW0SNi356L15AmficK5eRubs",
  publicKeyPem:
    "-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAWxT4sMRQ+46FDbsVlk4L6zGBPnueqsMORKp4uDebMl8=\n-----END PUBLIC KEY-----\n",
  privateKeyPem:
    "-----BEGIN PRIVATE KEY-----\nMC4CAQAwBQYDK2VwBCIEIH0I9o8szsQ5UcA2ridxZ6knMCtyR75/k+kC3sZNb2i9\n-----END PRIVATE KEY-----\n",
};
const agentCredential = createAgentCredential({
  owner,
  agent,
  scope: ["chat.message", "knowledge.query"],
  expiresAt: "2030-01-01T00:00:00.000Z",
  issuedAt: "2026-05-28T00:00:00.000Z",
});

type Vector = {
  id: string;
  description: string;
  intent: string;
  publicKeyPem: string;
  privateKeyPem: string;
  peerId: string;
  unsignedEnvelopeJson: Record<string, unknown>;
  signatureBase64Url: string;
  signedEnvelopeJson: Record<string, unknown>;
};

function buildVector(
  id: string,
  description: string,
  unsigned: ReturnType<typeof createUnsignedEnvelope>,
  privateKeyPem: string,
  publicKeyPem: string,
  peerId: string,
): Vector {
  const unsignedEnvelopeJson = { ...unsigned } as Record<string, unknown>;
  const signatureBase64Url = signCanonicalPayload(unsignedEnvelopeJson, privateKeyPem);
  const signedEnvelopeJson = { ...unsignedEnvelopeJson, signature: signatureBase64Url };
  return {
    id,
    description,
    intent: unsigned.intent,
    publicKeyPem,
    privateKeyPem,
    peerId,
    unsignedEnvelopeJson,
    signatureBase64Url,
    signedEnvelopeJson,
  };
}

const vectors: Vector[] = [
  buildVector(
    "system-ping",
    "Baseline system.ping on message channel (companion interop key)",
    createUnsignedEnvelope({
      messageId: "emp-conf-system-ping-01",
      correlationId: "emp-conf-corr-01",
      createdAt: "2026-05-28T00:00:00.000Z",
      senderPeerId: devicePeerId,
      senderPublicKey: devicePublicKeyPem,
      senderRole: "system",
      recipientPeerId: "envoy_peer_recv_test",
      recipientRole: "agent",
      intent: "system.ping",
      payload: {
        nonce: "emp-conf-nonce-01",
        message: "emp-conformance-ping",
      },
    }),
    devicePrivateKeyPem,
    devicePublicKeyPem,
    devicePeerId,
  ),
  buildVector(
    "knowledge-query-human",
    "Human knowledge.query for document acquisition negotiation",
    createUnsignedEnvelope({
      messageId: "emp-conf-kq-01",
      correlationId: "emp-conf-corr-02",
      createdAt: "2026-05-28T00:00:01.000Z",
      senderPeerId: devicePeerId,
      senderPublicKey: devicePublicKeyPem,
      senderRole: "human",
      recipientPeerId: "envoy_peer_publisher",
      recipientRole: "human",
      intent: "knowledge.query",
      payload: createKnowledgeQueryPayload({
        query: "Document acquisition metadata only: quarterly revenue report",
        requestedSensitivity: "friends",
      }),
    }),
    devicePrivateKeyPem,
    devicePublicKeyPem,
    devicePeerId,
  ),
  buildVector(
    "knowledge-response-suggested-path",
    "knowledge.response with suggestedRelativePath (Phase 16 doc acquisition)",
    createUnsignedEnvelope({
      messageId: "emp-conf-kr-01",
      correlationId: "emp-conf-corr-02",
      createdAt: "2026-05-28T00:00:02.000Z",
      senderPeerId: devicePeerId,
      senderPublicKey: devicePublicKeyPem,
      senderRole: "human",
      recipientPeerId: devicePeerId,
      recipientRole: "human",
      intent: "knowledge.response",
      payload: createKnowledgeResponsePayload({
        inReplyTo: "emp-conf-kq-01",
        answer: "The published library contains a matching quarterly report.",
        suggestedRelativePath: "shared/q3-revenue.pdf",
        sensitivity: "friends",
        matchScore: 0.91,
        refused: false,
      }),
    }),
    devicePrivateKeyPem,
    devicePublicKeyPem,
    devicePeerId,
  ),
  buildVector(
    "share-request-metadata",
    "share.request metadata after knowledge negotiation (no bytes on message stream)",
    createUnsignedEnvelope({
      messageId: "emp-conf-share-01",
      correlationId: "emp-conf-corr-03",
      createdAt: "2026-05-28T00:00:03.000Z",
      senderPeerId: devicePeerId,
      senderPublicKey: devicePublicKeyPem,
      senderRole: "human",
      recipientPeerId: "envoy_peer_publisher",
      recipientRole: "human",
      intent: "share.request",
      payload: createShareRequestPayload({
        requestType: "file",
        relativePath: "shared/q3-revenue.pdf",
        requestedSensitivity: "friends",
        correlationId: "emp-conf-corr-03",
      }),
    }),
    devicePrivateKeyPem,
    devicePublicKeyPem,
    devicePeerId,
  ),
  buildVector(
    "chat-message-human",
    "Human chat.message on chat channel",
    createUnsignedEnvelope({
      messageId: "emp-conf-chat-01",
      correlationId: "emp-conf-corr-04",
      createdAt: "2026-05-28T00:00:04.000Z",
      senderPeerId: devicePeerId,
      senderPublicKey: devicePublicKeyPem,
      senderRole: "human",
      recipientPeerId: "envoy_peer_human",
      recipientRole: "human",
      intent: "chat.message",
      payload: createChatMessagePayload({
        text: "Hello from EMP conformance vector",
        senderOwnerId: "envoy:owner:conformance_test",
      }),
    }),
    devicePrivateKeyPem,
    devicePublicKeyPem,
    devicePeerId,
  ),
];

const agentUnsigned = createUnsignedEnvelope({
  messageId: "emp-conf-chat-agent-01",
  correlationId: "emp-conf-corr-05",
  createdAt: "2026-05-28T00:00:05.000Z",
  senderPeerId: agent.agentPeerId,
  senderPublicKey: agent.publicKeyPem,
  senderRole: "agent",
  recipientPeerId: "envoy_peer_human",
  recipientRole: "human",
  intent: "chat.message",
  agentCredential,
  payload: createChatMessagePayload({
    text: "Agent greeting on behalf of owner (social proxy smoke)",
    senderOwnerId: owner.ownerId,
  }),
});
vectors.push(
  buildVector(
    "chat-message-agent",
    "Agent chat.message with agentCredential (Phase 16 social proxy)",
    agentUnsigned,
    agent.privateKeyPem,
    agent.publicKeyPem,
    agent.agentPeerId,
  ),
);

// Persist owner/agent keys for agent vector verification docs
const keysFixture = {
  _testOnly: "Do not use in production; CI conformance fixture keys",
  device: { publicKeyPem: devicePublicKeyPem, privateKeyPem: devicePrivateKeyPem, peerId: devicePeerId },
  owner: {
    ownerId: owner.ownerId,
    publicKeyPem: owner.publicKeyPem,
    privateKeyPem: owner.privateKeyPem,
  },
  agent: {
    agentId: agent.agentId,
    agentPeerId: agent.agentPeerId,
    publicKeyPem: agent.publicKeyPem,
    privateKeyPem: agent.privateKeyPem,
  },
};

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "keys.json"), `${JSON.stringify(keysFixture, null, 2)}\n`);
for (const vector of vectors) {
  const { privateKeyPem: _pk, ...published } = vector;
  writeFileSync(join(outDir, `${vector.id}.json`), `${JSON.stringify(published, null, 2)}\n`);
}
writeFileSync(
  join(outDir, "manifest.json"),
  `${JSON.stringify(
    {
      version: "emp/0.1",
      generatedAt: new Date().toISOString(),
      vectors: vectors.map((v) => ({ id: v.id, file: `${v.id}.json`, intent: v.intent, description: v.description })),
    },
    null,
    2,
  )}\n`,
);

console.log(`Wrote ${vectors.length} vectors to ${outDir}`);
