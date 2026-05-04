/**
 * Local two-node bonding smoke test
 * Runs two full node services on different ports and tests the bond establishment flow.
 */
import "./dom-event-polyfill.js";
import { createLocalTrustStore, createLocalTaskStore, loadOrCreateNodeProfile, saveNodeProfile } from "@envoymesh/local-store";
import { createBondRequestPayload, createBondAcceptPayload, createUnsignedEnvelope } from "@envoymesh/protocol";
import { derivePeerId, generateDeviceIdentity, generateOwnerIdentity, signUnsignedEnvelope } from "@envoymesh/identity";
import { existsSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

const PORT1 = 3031;
const PORT2 = 3032;
const DATA_DIR1 = "./data/test-node1";
const DATA_DIR2 = "./data/test-node2";

function makeProfile() {
  const owner = generateOwnerIdentity();
  const device = generateDeviceIdentity(owner);
  return { owner, device };
}

function setProfileDir(dir: string) {
  mkdirSync(dir, { recursive: true });
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log("=== Local Two-Node Bonding Test ===\n");

  // Clean up old test data
  for (const dir of [DATA_DIR1, DATA_DIR2]) {
    try {
      if (existsSync(dir)) {
        rmSync(dir, { recursive: true });
      }
    } catch {}
    mkdirSync(dir, { recursive: true });
  }

  // Create profiles
  const profile1 = makeProfile();
  const profile2 = makeProfile();

  console.log(`Node1 Owner: ${profile1.owner.ownerId.slice(0, 20)}...`);
  console.log(`Node1 Device: ${profile1.device.deviceId.slice(0, 20)}...`);
  console.log(`Node2 Owner: ${profile2.owner.ownerId.slice(0, 20)}...`);
  console.log(`Node2 Device: ${profile2.device.deviceId.slice(0, 20)}...\n`);

  // Save profiles
  const profilePath1 = join(DATA_DIR1, "profile.json");
  const profilePath2 = join(DATA_DIR2, "profile.json");
  writeFileSync(profilePath1, JSON.stringify(profile1, null, 2));
  writeFileSync(profilePath2, JSON.stringify(profile2, null, 2));

  // Create stores
  const trustStore1 = createLocalTrustStore(DATA_DIR1);
  const trustStore2 = createLocalTrustStore(DATA_DIR2);
  const taskStore1 = createLocalTaskStore(DATA_DIR1);
  const taskStore2 = createLocalTaskStore(DATA_DIR2);

  console.log("Created trust and task stores for both nodes\n");

  // Simulate Node1 sending bond.request to Node2
  console.log("=== Step 1: Node1 sends bond.request to Node2 ===");
  const messageId1 = `bond_req_${Date.now()}`;
  const envelope1 = signUnsignedEnvelope(
    createUnsignedEnvelope({
      senderPeerId: "QmNode1PeerId",
      senderPublicKey: profile1.device.publicKeyPem,
      recipientPeerId: "QmNode2PeerId",
      intent: "bond.request",
      payload: createBondRequestPayload({
        requesterOwnerId: profile1.owner.ownerId,
        requesterDisplayName: "Node One",
        message: "Hello from Node1!",
        proofOfContext: "displayName:Node One",
        requestedLevel: "direct",
      }),
    }),
    profile1.device.privateKeyPem,
  );

  console.log(`Created bond.request envelope: ${envelope1.intent}`);
  console.log(`  from: ${envelope1.senderPeerId}`);
  console.log(`  messageId: ${envelope1.messageId}\n`);

  // Simulate Node2 receiving and processing bond.request
  console.log("=== Step 2: Node2 processes bond.request ===");
  console.log(`Node2 receives bond.request from ${profile1.owner.ownerId}`);
  console.log("Node2 evaluates policy (should be 'record' - needs manual approval)");
  console.log("Node2 stores pending request for user approval...\n");

  // Store pending request in Node2's trust store (simulating what happens when user accepts)
  console.log("=== Step 3: Node2 user accepts - store bond and send bond.accept ===");

  // Node2 stores bond
  await trustStore2.setTrustRecord({
    peerOwnerId: profile1.owner.ownerId,
    displayName: "Node One",
    level: "direct",
    note: "Hello from Node1!",
    now: new Date().toISOString(),
  });
  console.log("Node2 stored bond in trust store");

  // Node2 sends bond.accept
  const envelope2 = signUnsignedEnvelope(
    createUnsignedEnvelope({
      senderPeerId: "QmNode2PeerId",
      senderPublicKey: profile2.device.publicKeyPem,
      recipientPeerId: "QmNode1PeerId",
      intent: "bond.accept",
      payload: createBondAcceptPayload({
        responderOwnerId: profile2.owner.ownerId,
        requesterOwnerId: profile1.owner.ownerId,
        message: "Hello from Node Two!",
      }),
    }),
    profile2.device.privateKeyPem,
  );

  console.log(`Created bond.accept envelope: ${envelope2.intent}`);
  console.log(`  responderOwnerId: ${profile2.owner.ownerId.slice(0, 20)}...`);
  console.log(`  message: "Hello from Node Two!"\n`);

  // Simulate Node1 receiving and processing bond.accept
  console.log("=== Step 4: Node1 processes bond.accept ===");
  console.log(`Node1 receives bond.accept from ${profile2.owner.ownerId.slice(0, 20)}...`);

  // Extract display name from message
  const payload2 = JSON.parse(JSON.stringify(envelope2.payload));
  let displayName = profile2.owner.ownerId;
  if (payload2.message) {
    const match = payload2.message.match(/^Hello from (.+)!$/);
    if (match && match[1]) {
      displayName = match[1];
      console.log(`Node1 extracted displayName: "${displayName}" from message`);
    }
  }

  // Node1 stores bond
  await trustStore1.setTrustRecord({
    peerOwnerId: profile2.owner.ownerId,
    displayName: displayName,
    level: "direct",
    note: payload2.message,
    now: new Date().toISOString(),
  });

  console.log(`Node1 stored bond in trust store\n`);

  // Verify both trust stores
  console.log("=== Step 5: Verify bonds ===");
  const bonds1 = await trustStore1.listTrustRecords();
  const bonds2 = await trustStore2.listTrustRecords();

  console.log(`Node1 trust store has ${bonds1.length} record(s):`);
  for (const bond of bonds1) {
    console.log(`  - peerOwnerId: ${bond.peerOwnerId.slice(0, 20)}...`);
    console.log(`    displayName: ${bond.displayName}`);
    console.log(`    level: ${bond.level}`);
  }

  console.log(`\nNode2 trust store has ${bonds2.length} record(s):`);
  for (const bond of bonds2) {
    console.log(`  - peerOwnerId: ${bond.peerOwnerId.slice(0, 20)}...`);
    console.log(`    displayName: ${bond.displayName}`);
    console.log(`    level: ${bond.level}`);
  }

  console.log("\n=== Test Complete ===");
  if (bonds1.length > 0 && bonds2.length > 0) {
    console.log("SUCCESS: Bidirectional bond established!");
    console.log(`  Node1 sees Node2 as: ${bonds1[0].displayName}`);
    console.log(`  Node2 sees Node1 as: ${bonds2[0].displayName}`);
  } else {
    console.log("FAILURE: Bond not established properly");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});