/**
 * Export EMP/0.1 Zod schemas as JSON Schema for third-party implementers.
 * Uses Zod 4 native `toJSONSchema()` (draft 2020-12).
 *
 * Usage: npm run export-schemas -w @envoymesh/protocol
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { z } from "zod";
import {
  AgentCardSchema,
  BondRequestPayloadSchema,
  ChatMessagePayloadSchema,
  DiscoveryRequestPayloadSchema,
  DiscoveryResponsePayloadSchema,
  EmpCapabilitySchema,
  EmpPostureSchema,
  EnvoyActorRoleSchema,
  EnvoyIntentSchema,
  KnowledgeQueryPayloadSchema,
  KnowledgeResponsePayloadSchema,
  MandateSchema,
  ShareAcceptPayloadSchema,
  ShareRequestPayloadSchema,
  SocialIntroProposePayloadSchema,
  SocialIntroSyncPayloadSchema,
  UnsignedEnvoyEnvelopeSchema,
  UnsignedMandateSchema,
} from "../src/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, "..", "schemas", "emp-0.1");

type ZodJsonSchema = z.ZodType & { toJSONSchema: () => Record<string, unknown> };

type ExportEntry = { file: string; schema: ZodJsonSchema; title: string };

const exports: ExportEntry[] = [
  { file: "emp-intents.json", schema: EnvoyIntentSchema as ZodJsonSchema, title: "EMP Intent" },
  { file: "emp-actor-roles.json", schema: EnvoyActorRoleSchema as ZodJsonSchema, title: "EMP Actor Role" },
  { file: "emp-postures.json", schema: EmpPostureSchema as ZodJsonSchema, title: "EMP Standing Posture" },
  { file: "emp-capabilities.json", schema: EmpCapabilitySchema as ZodJsonSchema, title: "EMP Advertised Capability" },
  { file: "unsigned-envelope.json", schema: UnsignedEnvoyEnvelopeSchema as ZodJsonSchema, title: "Unsigned EMP Envelope" },
  { file: "knowledge-query-payload.json", schema: KnowledgeQueryPayloadSchema as ZodJsonSchema, title: "knowledge.query Payload" },
  { file: "knowledge-response-payload.json", schema: KnowledgeResponsePayloadSchema as ZodJsonSchema, title: "knowledge.response Payload" },
  { file: "chat-message-payload.json", schema: ChatMessagePayloadSchema as ZodJsonSchema, title: "chat.message Payload" },
  { file: "discovery-request-payload.json", schema: DiscoveryRequestPayloadSchema as ZodJsonSchema, title: "discovery.request Payload" },
  { file: "discovery-response-payload.json", schema: DiscoveryResponsePayloadSchema as ZodJsonSchema, title: "discovery.response Payload" },
  { file: "share-request-payload.json", schema: ShareRequestPayloadSchema as ZodJsonSchema, title: "share.request Payload" },
  { file: "share-accept-payload.json", schema: ShareAcceptPayloadSchema as ZodJsonSchema, title: "share.accept Payload" },
  { file: "bond-request-payload.json", schema: BondRequestPayloadSchema as ZodJsonSchema, title: "bond.request Payload" },
  { file: "mandate.json", schema: MandateSchema as ZodJsonSchema, title: "Signed Mandate" },
  { file: "unsigned-mandate.json", schema: UnsignedMandateSchema as ZodJsonSchema, title: "Unsigned Mandate" },
  { file: "agent-card.json", schema: AgentCardSchema as ZodJsonSchema, title: "Agent Card" },
  { file: "social-intro-sync-payload.json", schema: SocialIntroSyncPayloadSchema as ZodJsonSchema, title: "social.intro.sync Payload" },
  { file: "social-intro-propose-payload.json", schema: SocialIntroProposePayloadSchema as ZodJsonSchema, title: "social.intro.propose Payload" },
];

async function main(): Promise<void> {
  await mkdir(outDir, { recursive: true });

  const manifest: Array<{ file: string; title: string; $id: string }> = [];

  for (const entry of exports) {
    const $id = `https://envoymesh.dev/schemas/emp-0.1/${entry.file}`;
    const body = entry.schema.toJSONSchema();
    const doc = {
      $id,
      title: entry.title,
      ...body,
    };
    await writeFile(join(outDir, entry.file), `${JSON.stringify(doc, null, 2)}\n`, "utf8");
    manifest.push({ file: entry.file, title: entry.title, $id });
  }

  const index = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "https://envoymesh.dev/schemas/emp-0.1/index.json",
    title: "EnvoyMesh Protocol (EMP) 0.1 JSON Schema Bundle",
    description:
      "Machine-readable schemas generated from @envoymesh/protocol Zod definitions. Normative behavior: docs/protocol-standard.md",
    version: "emp/0.1",
    jsonSchemaDraft: "2020-12",
    generatedBy: "@envoymesh/protocol/scripts/export-json-schema.ts",
    schemas: manifest,
  };
  await writeFile(join(outDir, "index.json"), `${JSON.stringify(index, null, 2)}\n`, "utf8");
  console.log(`Exported ${exports.length} schemas to ${outDir}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
