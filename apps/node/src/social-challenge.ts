import "./dom-event-polyfill.js";
import { derivePeerId, generateIdentity, signUnsignedEnvelope } from "@envoymesh/identity";
import { loadOrCreateNodeProfile } from "@envoymesh/local-store";
import { DEFAULT_LIBP2P_PRIVATE_KEY_BASENAME, EnvoyMesh } from "@envoymesh/network";
import { createSystemPingPayload, createUnsignedEnvelope, type EnvoyEnvelope } from "@envoymesh/protocol";
import { join } from "node:path";

type Scenario =
  | "invalid-signature"
  | "replay"
  | "oversized"
  | "malformed-json"
  | "task-payload-invalid"
  | "all";

interface SocialChallengeArgs {
  profileDir: string;
  listen: string[];
  target: string;
  scenario: Scenario;
}

const args = parseSocialChallengeArgs(process.argv.slice(2));
const profile = await loadOrCreateNodeProfile(args.profileDir);
const stranger = generateIdentity();

const mesh = new EnvoyMesh({
  listen: args.listen,
  libp2pPrivateKeyPath: join(args.profileDir, DEFAULT_LIBP2P_PRIVATE_KEY_BASENAME),
});
await mesh.start();

try {
  console.log(`Social challenge peer: ${mesh.peerId}`);
  console.log(`Victim profile device: ${profile.device.deviceId}`);
  console.log(`Stranger peer id: ${stranger.peerId}`);
  console.log(`Target: ${args.target}`);
  console.log(`Scenario: ${args.scenario}`);

  const scenarios: Scenario[] =
    args.scenario === "all"
      ? ["invalid-signature", "replay", "oversized", "malformed-json", "task-payload-invalid"]
      : [args.scenario];

  for (const scenario of scenarios) {
    console.log(`\n--- ${scenario} ---`);
    if (scenario === "invalid-signature") {
      await sendEnvelope(args.target, tamperedSignaturePing(stranger));
    } else if (scenario === "replay") {
      const envelope = signedPing(stranger, "replay-probe");
      await sendEnvelope(args.target, envelope);
      await sendEnvelope(args.target, envelope);
    } else if (scenario === "oversized") {
      await sendEnvelope(args.target, oversizedPing(stranger));
    } else if (scenario === "malformed-json") {
      await sendRawBytes(args.target, new TextEncoder().encode("{not-json"));
    } else if (scenario === "task-payload-invalid") {
      await sendEnvelope(
        args.target,
        signedTaskMandateWithBadPayload(stranger),
      );
    }
  }

  console.log("\nDone. Inspect the victim node's audit log for rejects/handling.");
} finally {
  await mesh.stop();
}

function parseSocialChallengeArgs(argv: string[]): SocialChallengeArgs {
  const parsed: SocialChallengeArgs = {
    profileDir: "./data/default",
    listen: ["/ip4/0.0.0.0/tcp/0"],
    target: "",
    scenario: "all",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--profile") {
      parsed.profileDir = readValue(argv, ++index, arg);
    } else if (arg === "--listen") {
      parsed.listen = [readValue(argv, ++index, arg)];
    } else if (arg === "--target") {
      parsed.target = readValue(argv, ++index, arg);
    } else if (arg === "--scenario") {
      parsed.scenario = parseScenario(readValue(argv, ++index, arg));
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!parsed.target) {
    throw new Error("Missing --target <multiaddr>");
  }

  return parsed;
}

function printHelp(): void {
  console.log(`EnvoyMesh social challenge probe

Sends intentionally hostile (but non-secret-exfiltrating) traffic to a victim node
to validate inbound guard and task parsing paths.

Usage:
  npm run social:challenge -w @envoymesh/node -- --target <multiaddr> [--profile <dir>] [--listen <multiaddr>] [--scenario <name>]

Scenarios:
  invalid-signature       Valid envelope bytes, tampered payload (signature check should fail)
  replay                  Send the same signed ping twice (second should be rejected)
  oversized               Envelope JSON exceeds the inbound guard max size
  malformed-json          Non-JSON bytes on the Envoy message protocol stream
  task-payload-invalid    task.mandate intent with a non-mandate payload (dispatcher should reject)
  all                     Run the scenarios above in order
`);
}

function readValue(argv: string[], index: number, flag: string): string {
  const value = argv[index];

  if (!value) {
    throw new Error(`Missing value for ${flag}`);
  }

  return value;
}

function parseScenario(value: string): Scenario {
  if (
    value === "invalid-signature" ||
    value === "replay" ||
    value === "oversized" ||
    value === "malformed-json" ||
    value === "task-payload-invalid" ||
    value === "all"
  ) {
    return value;
  }

  throw new Error(`Invalid scenario: ${value}`);
}

function signedPing(identity: ReturnType<typeof generateIdentity>, message: string): EnvoyEnvelope {
  const unsigned = createUnsignedEnvelope({
    senderPeerId: identity.peerId,
    senderPublicKey: identity.publicKeyPem,
    intent: "system.ping",
    payload: createSystemPingPayload(message),
    messageId: `social-${message}-${cryptoRandomId()}`,
    createdAt: new Date().toISOString(),
  });

  return signUnsignedEnvelope(unsigned, identity.privateKeyPem);
}

function tamperedSignaturePing(identity: ReturnType<typeof generateIdentity>): EnvoyEnvelope {
  const signed = signedPing(identity, "tampered");
  return {
    ...signed,
    payload: createSystemPingPayload("tampered-after-signing"),
  };
}

function oversizedPing(identity: ReturnType<typeof generateIdentity>): EnvoyEnvelope {
  const padding = "x".repeat(70 * 1024);
  const unsigned = createUnsignedEnvelope({
    senderPeerId: identity.peerId,
    senderPublicKey: identity.publicKeyPem,
    intent: "system.ping",
    payload: {
      ...createSystemPingPayload("oversized-envelope"),
      padding,
    },
    messageId: `social-oversized-${cryptoRandomId()}`,
    createdAt: new Date().toISOString(),
  });

  return signUnsignedEnvelope(unsigned, identity.privateKeyPem);
}

function signedTaskMandateWithBadPayload(identity: ReturnType<typeof generateIdentity>): EnvoyEnvelope {
  const unsigned = createUnsignedEnvelope({
    senderPeerId: identity.peerId,
    senderPublicKey: identity.publicKeyPem,
    recipientPeerId: derivePeerId(profile.device.publicKeyPem),
    intent: "task.mandate",
    payload: { not: "a mandate" },
    messageId: `social-bad-mandate-${cryptoRandomId()}`,
    createdAt: new Date().toISOString(),
  });

  return signUnsignedEnvelope(unsigned, identity.privateKeyPem);
}

async function sendEnvelope(target: string, envelope: EnvoyEnvelope): Promise<void> {
  const latencyMs = await mesh.send(target, envelope);
  console.log(`sent envelope intent=${envelope.intent} messageId=${envelope.messageId} latencyMs=${latencyMs}`);
}

async function sendRawBytes(target: string, bytes: Uint8Array): Promise<void> {
  const latencyMs = await mesh.sendRawBytes(target, bytes);
  console.log(`sent raw bytes length=${bytes.byteLength} latencyMs=${latencyMs}`);
}

function cryptoRandomId(): string {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
