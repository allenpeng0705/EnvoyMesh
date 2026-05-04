/**
 * Run two full nodes on the same Mac with different data directories
 * Node 1: port 3031, data dir ./data/node1
 * Node 2: port 3032, data dir ./data/node2
 */
import "./dom-event-polyfill.js";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { createLocalTrustStore, createLocalTaskStore, createLocalPeerDirectoryStore, createHumanProfileStore } from "@envoymesh/local-store";
import { derivePeerId, generateDeviceIdentity, generateOwnerIdentity } from "@envoymesh/identity";
import { createNodeService } from "./node-service-impl.js";
import { WsServer } from "./ws-server.js";
import { EnvoyMesh } from "@envoymesh/network";

const DATA_DIR1 = "./data/node1";
const DATA_DIR2 = "./data/node2";
const WS_PORT1 = 3031;
const WS_PORT2 = 3032;

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function setupDataDir(dir: string) {
  try {
    if (existsSync(dir)) {
      rmSync(dir, { recursive: true });
    }
  } catch {}
  mkdirSync(dir, { recursive: true });
}

async function main() {
  console.log("=== Starting Two Local Nodes ===\n");

  // Setup data directories
  setupDataDir(DATA_DIR1);
  setupDataDir(DATA_DIR2);

  // Create identities for both nodes
  const owner1 = generateOwnerIdentity();
  const device1 = generateDeviceIdentity(owner1);
  const profile1 = {
    owner: owner1,
    device: device1,
    deviceCertificate: { devicePublicKeyPem: device1.publicKeyPem } as any,
  };

  const owner2 = generateOwnerIdentity();
  const device2 = generateDeviceIdentity(owner2);
  const profile2 = {
    owner: owner2,
    device: device2,
    deviceCertificate: { devicePublicKeyPem: device2.publicKeyPem } as any,
  };

  console.log(`Node1 Owner: ${owner1.ownerId.slice(0, 20)}...`);
  console.log(`Node1 Display Name: Alice`);
  console.log(`Node2 Owner: ${owner2.ownerId.slice(0, 20)}...`);
  console.log(`Node2 Display Name: Bob\n`);

  // Create mesh1
  console.log("Starting Node1 (mesh)...\n");
  const mesh1 = new EnvoyMesh({
    listen: ["/ip4/127.0.0.1/tcp/0"],
    enableMdns: false,
    enableDht: false,
    enableRelay: false,
    enableRelayServer: false,
  });
  await mesh1.start();
  console.log(`Node1 peer ID: ${mesh1.peerId}`);
  console.log(`Node1 listening on: ${mesh1.multiaddrs.map((m) => m.toString()).join(", ")}\n`);

  // Create mesh2
  console.log("Starting Node2 (mesh)...\n");
  const mesh2 = new EnvoyMesh({
    listen: ["/ip4/127.0.0.1/tcp/0"],
    enableMdns: false,
    enableDht: false,
    enableRelay: false,
    enableRelayServer: false,
  });
  await mesh2.start();
  console.log(`Node2 peer ID: ${mesh2.peerId}`);
  console.log(`Node2 listening on: ${mesh2.multiaddrs.map((m) => m.toString()).join(", ")}\n`);

  // Create trust stores
  const trustStore1 = createLocalTrustStore(DATA_DIR1);
  const trustStore2 = createLocalTrustStore(DATA_DIR2);
  const taskStore1 = createLocalTaskStore(DATA_DIR1);
  const taskStore2 = createLocalTaskStore(DATA_DIR2);
  const peerDir1 = createLocalPeerDirectoryStore(DATA_DIR1);
  const peerDir2 = createLocalPeerDirectoryStore(DATA_DIR2);
  const humanProfile1 = createHumanProfileStore(DATA_DIR1);
  const humanProfile2 = createHumanProfileStore(DATA_DIR2);

  // Save profiles
  const { saveNodeProfile } = await import("@envoymesh/local-store");
  await saveNodeProfile(join(DATA_DIR1, "profile.json"), profile1);
  await saveNodeProfile(join(DATA_DIR2, "profile.json"), profile2);

  // Save human profiles with display names
  await humanProfile1.saveHumanProfile({
    ownerId: owner1.ownerId,
    displayName: "Alice",
    bio: "Node 1 user",
    gender: "",
    hobbies: [],
    knowledge: [],
    updatedAt: new Date().toISOString(),
    signature: "",
  });
  await humanProfile2.saveHumanProfile({
    ownerId: owner2.ownerId,
    displayName: "Bob",
    bio: "Node 2 user",
    gender: "",
    hobbies: [],
    knowledge: [],
    updatedAt: new Date().toISOString(),
    signature: "",
  });

  console.log("Saved profiles for both nodes\n");

  // Create node services
  const nodeService1 = createNodeService(mesh1 as any, trustStore1, peerDir1, humanProfile1, DATA_DIR1, profile1);
  const nodeService2 = createNodeService(mesh2 as any, trustStore2, peerDir2, humanProfile2, DATA_DIR2, profile2);

  // Wire up message handling for bond.* in mesh1
  const { evaluatePolicy } = await import("@envoymesh/bonds");
  const { handleInboundBondIntent } = await import("./bond-inbound.js");
  const { parseBondAcceptPayload, parseBondRequestPayload } = await import("@envoymesh/protocol");
  const { createAuditEvent } = await import("@envoymesh/local-store");

  mesh1.onMessage(async ({ envelope, remotePeerId }) => {
    console.log(`[Node1 mesh] received: ${envelope.intent} from ${remotePeerId}`);

    if (envelope.intent === "bond.request") {
      const payload = parseBondRequestPayload(envelope.payload);
      console.log(`  requester: ${payload.requesterDisplayName} (${payload.requesterOwnerId.slice(0, 15)}...)`);
    }

    if (envelope.intent === "bond.accept") {
      const payload = parseBondAcceptPayload(envelope.payload);
      console.log(`  responder: ${payload.responderOwnerId.slice(0, 15)}...`);
      console.log(`  message: ${payload.message}`);
    }

    // Handle bond intents via handleInboundBondIntent
    if (envelope.intent === "bond.request" || envelope.intent === "bond.accept") {
      const bond = await handleInboundBondIntent(
        {
          envelope,
          profile: profile1,
          remotePeerId,
          receivedAt: Date.now(),
          correlationId: envelope.correlationId,
          taskStore: taskStore1,
          trustStore: trustStore1,
        },
        (helloData) => {
          console.log(`[Node1] hello:request event for ${helloData.sender.displayName}`);
          nodeService1.storePendingHelloRequest(helloData);
        },
        (bondData) => {
          console.log(`[Node1] bond:established event for ${bondData.peerOwnerId.slice(0, 15)}...`);
        },
      );
    }
  });

  mesh2.onMessage(async ({ envelope, remotePeerId }) => {
    console.log(`[Node2 mesh] received: ${envelope.intent} from ${remotePeerId}`);

    if (envelope.intent === "bond.request") {
      const payload = parseBondRequestPayload(envelope.payload);
      console.log(`  requester: ${payload.requesterDisplayName} (${payload.requesterOwnerId.slice(0, 15)}...)`);
    }

    if (envelope.intent === "bond.accept") {
      const payload = parseBondAcceptPayload(envelope.payload);
      console.log(`  responder: ${payload.responderOwnerId.slice(0, 15)}...`);
      console.log(`  message: ${payload.message}`);
    }
  });

  console.log("=== Waiting for nodes to stabilize (5 seconds)... ===");
  await sleep(5000);

  // Node1 sends bond.request to Node2
  console.log("\n=== Node1 sends bond.request to Node2 ===");
  console.log(`Node2 peer ID: ${mesh2.peerId}`);
  console.log(`Node2 multiaddr: ${mesh2.multiaddrs[0]}`);

  // Node1 sends bond.request directly to Node2's known address
  const { createBondRequestPayload, createUnsignedEnvelope } = await import("@envoymesh/protocol");
  const { signUnsignedEnvelope } = await import("@envoymesh/identity");

  const bondRequestEnvelope = signUnsignedEnvelope(
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

  console.log("Node1 dialing Node2 directly...");
  console.log(`  sending to: ${mesh2.multiaddrs[0]}`);
  try {
    await mesh1.send(mesh2.multiaddrs[0], bondRequestEnvelope);
    console.log("bond.request sent successfully!");
  } catch (err) {
    console.error(`Failed to send bond.request: ${err}`);
  }

  console.log("\n=== Waiting for bond.request to be delivered and processed (3 seconds)... ===");
  await sleep(3000);

  console.log("\n=== Test Complete ===");
  console.log("\nCheck the trust stores to see if bonds were created:");
  console.log(`Node1 trust records: ${(await trustStore1.listTrustRecords()).length}`);
  console.log(`Node2 trust records: ${(await trustStore2.listTrustRecords()).length}`);

  // Now simulate Node2 user accepting the bond.request
  console.log("\n=== Simulating Node2 user accepting bond.request ===");
  console.log("Node2 stores bond in trust store and sends bond.accept to Node1");

  // Node2 stores the bond (accepting)
  await trustStore2.setTrustRecord({
    peerOwnerId: owner1.ownerId,
    displayName: "Alice",
    level: "direct",
    note: "Hello from Alice!",
    now: new Date().toISOString(),
  });
  console.log("Node2 stored bond in trust store");

  // Node2 sends bond.accept
  const { createBondAcceptPayload } = await import("@envoymesh/protocol");
  const bondAcceptEnvelope = signUnsignedEnvelope(
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

  console.log("Node2 sending bond.accept to Node1...");
  try {
    await mesh2.send(mesh1.multiaddrs[0], bondAcceptEnvelope);
    console.log("bond.accept sent successfully!");
  } catch (err) {
    console.error(`Failed to send bond.accept: ${err}`);
  }

  console.log("\n=== Waiting for bond.accept to be delivered (3 seconds)... ===");
  await sleep(3000);

  // Now Node1 processes bond.accept - need to wire up bond-inbound handler
  console.log("\n=== Node1 processes bond.accept ===");
  // The mesh.onMessage for Node1 already handles bond.accept via handleInboundBondIntent
  // But we need to verify the trust store was updated

  console.log("\n=== Final State ===");
  const finalBonds1 = await trustStore1.listTrustRecords();
  const finalBonds2 = await trustStore2.listTrustRecords();

  console.log(`Node1 trust records: ${finalBonds1.length}`);
  for (const bond of finalBonds1) {
    console.log(`  - ${bond.displayName} (${bond.peerOwnerId.slice(0, 15)}...) level=${bond.level}`);
  }

  console.log(`Node2 trust records: ${finalBonds2.length}`);
  for (const bond of finalBonds2) {
    console.log(`  - ${bond.displayName} (${bond.peerOwnerId.slice(0, 15)}...) level=${bond.level}`);
  }

  if (finalBonds1.length > 0 && finalBonds2.length > 0) {
    console.log("\nSUCCESS: Bidirectional bond established!");
  } else {
    console.log("\nFAILURE: Bond not fully established");
  }

  // Cleanup
  console.log("\nStopping nodes...");
  await mesh1.stop();
  await mesh2.stop();

  console.log("\nDone. You can manually check the data directories:");
  console.log(`  cat ${DATA_DIR1}/trust-records.json`);
  console.log(`  cat ${DATA_DIR2}/trust-records.json`);
}

main().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});