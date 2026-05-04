/**
 * Full end-to-end two-node bonding test with actual network
 */
import "./dom-event-polyfill.js";
import { createLocalTrustStore, createLocalTaskStore, createLocalPeerDirectoryStore, loadOrCreateNodeProfile, saveNodeProfile } from "@envoymesh/local-store";
import { derivePeerId, generateDeviceIdentity, generateOwnerIdentity } from "@envoymesh/identity";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const PORT1 = 3031;
const PORT2 = 3032;
const DATA_DIR1 = "./data/test-node1";
const DATA_DIR2 = "./data/test-node2";

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log("=== Full Two-Node Bonding Test ===\n");

  // Clean up old test data
  for (const dir of [DATA_DIR1, DATA_DIR2]) {
    try {
      if (existsSync(dir)) {
        rmSync(dir, { recursive: true });
      }
    } catch {}
    mkdirSync(dir, { recursive: true });
  }

  // Create identity profiles
  const owner1 = generateOwnerIdentity();
  const device1 = generateDeviceIdentity(owner1);
  const profile1 = { owner: owner1, device: device1, deviceCertificate: { devicePublicKeyPem: device1.publicKeyPem } as any };

  const owner2 = generateOwnerIdentity();
  const device2 = generateDeviceIdentity(owner2);
  const profile2 = { owner: owner2, device: device2, deviceCertificate: { devicePublicKeyPem: device2.publicKeyPem } as any };

  console.log(`Node1: ${owner1.ownerId.slice(0, 15)}...`);
  console.log(`Node2: ${owner2.ownerId.slice(0, 15)}...\n`);

  // Import network dynamically to avoid circular deps
  const { EnvoyMesh } = await import("@envoymesh/network");
  const { createBondRequestPayload, createBondAcceptPayload, createUnsignedEnvelope, parseBondAcceptPayload } = await import("@envoymesh/protocol");
  const { signUnsignedEnvelope } = await import("@envoymesh/identity");

  // Create two EnvoyMesh instances
  console.log("Starting Node1 on port 9001...");
  const mesh1 = new EnvoyMesh({
    listen: ["/ip4/127.0.0.1/tcp/9001"],
    enableMdns: false,
    enableDht: false,
    enableRelay: false,
  });

  console.log("Starting Node2 on port 9002...");
  const mesh2 = new EnvoyMesh({
    listen: ["/ip4/127.0.0.1/tcp/9002"],
    enableMdns: false,
    enableDht: false,
    enableRelay: false,
  });

  await Promise.all([mesh1.start(), mesh2.start()]);
  console.log(`Node1 peer ID: ${mesh1.peerId}`);
  console.log(`Node2 peer ID: ${mesh2.peerId}\n`);

  // Set up message handlers
  let bondRequestReceived = false;
  let bondAcceptReceived = false;
  let bondAcceptDisplayName = "";

  mesh1.onMessage(async ({ envelope, remotePeerId }) => {
    console.log(`Node1 received: ${envelope.intent} from ${remotePeerId}`);

    if (envelope.intent === "bond.request") {
      const { parseBondRequestPayload } = await import("@envoymesh/protocol");
      const payload = parseBondRequestPayload(envelope.payload);
      console.log(`  requesterOwnerId: ${payload.requesterOwnerId.slice(0, 15)}...`);
      console.log(`  displayName: ${payload.requesterDisplayName}`);
      bondRequestReceived = true;
    }

    if (envelope.intent === "bond.accept") {
      const payload = parseBondAcceptPayload(envelope.payload);
      console.log(`  responderOwnerId: ${payload.responderOwnerId.slice(0, 15)}...`);
      console.log(`  message: ${payload.message}`);
      bondAcceptReceived = true;

      // Extract displayName
      if (payload.message) {
        const match = payload.message.match(/^Hello from (.+)!$/);
        if (match && match[1]) {
          bondAcceptDisplayName = match[1];
          console.log(`  extracted displayName: "${bondAcceptDisplayName}"`);
        }
      }
    }
  });

  mesh2.onMessage(async ({ envelope, remotePeerId }) => {
    console.log(`Node2 received: ${envelope.intent} from ${remotePeerId}`);

    if (envelope.intent === "bond.request") {
      const { parseBondRequestPayload } = await import("@envoymesh/protocol");
      const payload = parseBondRequestPayload(envelope.payload);
      console.log(`  requesterOwnerId: ${payload.requesterOwnerId.slice(0, 15)}...`);
      console.log(`  displayName: ${payload.requesterDisplayName}`);
      bondRequestReceived = true;
    }

    if (envelope.intent === "bond.accept") {
      const payload = parseBondAcceptPayload(envelope.payload);
      console.log(`  responderOwnerId: ${payload.responderOwnerId.slice(0, 15)}...`);
      console.log(`  message: ${payload.message}`);
      bondAcceptReceived = true;
    }
  });

  // Node1 sends bond.request to Node2
  console.log("=== Node1 sends bond.request to Node2 ===");
  const reqEnvelope = signUnsignedEnvelope(
    createUnsignedEnvelope({
      senderPeerId: mesh1.peerId,
      senderPublicKey: device1.publicKeyPem,
      recipientPeerId: mesh2.peerId,
      intent: "bond.request",
      payload: createBondRequestPayload({
        requesterOwnerId: owner1.ownerId,
        requesterDisplayName: "Alice",
        message: "Hello from Alice!",
        proofOfContext: "displayName:Alice",
        requestedLevel: "direct",
      }),
    }),
    device1.privateKeyPem,
  );

  console.log(`Sending bond.request to ${mesh2.multiaddrs[0]}...`);
  await mesh1.send(mesh2.multiaddrs[0], reqEnvelope);
  console.log("bond.request sent\n");

  // Wait for delivery
  await sleep(1000);

  if (!bondRequestReceived) {
    console.log("ERROR: Node2 did not receive bond.request!");
  } else {
    console.log("Node2 received bond.request successfully\n");
  }

  // Node2 sends bond.accept back to Node1
  console.log("=== Node2 sends bond.accept to Node1 ===");
  const acceptEnvelope = signUnsignedEnvelope(
    createUnsignedEnvelope({
      senderPeerId: mesh2.peerId,
      senderPublicKey: device2.publicKeyPem,
      recipientPeerId: mesh1.peerId,
      intent: "bond.accept",
      payload: createBondAcceptPayload({
        responderOwnerId: owner2.ownerId,
        requesterOwnerId: owner1.ownerId,
        message: "Hello from Bob!",
      }),
    }),
    device2.privateKeyPem,
  );

  console.log(`Sending bond.accept to ${mesh1.multiaddrs[0]}...`);
  await mesh2.send(mesh1.multiaddrs[0], acceptEnvelope);
  console.log("bond.accept sent\n");

  // Wait for delivery
  await sleep(1000);

  if (!bondAcceptReceived) {
    console.log("ERROR: Node1 did not receive bond.accept!");
  } else {
    console.log("Node1 received bond.accept successfully");
    console.log(`  displayName extracted: "${bondAcceptDisplayName}"\n`);
  }

  // Summary
  console.log("=== Test Summary ===");
  console.log(`bond.request delivered: ${bondRequestReceived ? "YES" : "NO"}`);
  console.log(`bond.accept delivered: ${bondAcceptReceived ? "YES" : "NO"}`);
  console.log(`displayName extraction: ${bondAcceptDisplayName === "Bob" ? "CORRECT (Bob)" : "INCORRECT (got: " + bondAcceptDisplayName + ")"}`);

  if (bondRequestReceived && bondAcceptReceived && bondAcceptDisplayName === "Bob") {
    console.log("\nSUCCESS: Full bonding flow works!");
  } else {
    console.log("\nFAILURE: Bonding flow incomplete");
    process.exit(1);
  }

  await mesh1.stop();
  await mesh2.stop();
}

main().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});