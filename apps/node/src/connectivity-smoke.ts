import { generateIdentity, signUnsignedEnvelope, verifyEnvelope } from "@envoymesh/identity";
import { EnvoyMesh, type DiscoveredMeshPeer } from "@envoymesh/network";
import { createSystemPingPayload, createUnsignedEnvelope } from "@envoymesh/protocol";

interface SmokeArgs {
  mode: "mdns" | "advanced";
  timeoutMs: number;
  listen: string[];
  mdnsIntervalMs: number;
  bootstrapPeers: string[];
  expectRelayAddress: boolean;
}

const meshes: EnvoyMesh[] = [];

const args = parseSmokeArgs(process.argv.slice(2));

try {
  if (args.mode === "mdns") {
    await runMdnsSmoke(args);
  } else {
    await runAdvancedConnectivitySmoke(args);
  }
} finally {
  await Promise.all(meshes.splice(0).map((mesh) => mesh.stop()));
}

async function runMdnsSmoke(args: SmokeArgs): Promise<void> {
  const first = await startMesh({
    listen: args.listen,
    enableMdns: true,
    mdnsIntervalMs: args.mdnsIntervalMs,
  });
  const second = await startMesh({
    listen: args.listen,
    enableMdns: true,
    mdnsIntervalMs: args.mdnsIntervalMs,
  });

  console.log(`[mdns] first peer=${first.peerId}`);
  console.log(`[mdns] second peer=${second.peerId}`);

  const firstSawSecond = waitForPeer(first, second.peerId, args.timeoutMs);
  const secondSawFirst = waitForPeer(second, first.peerId, args.timeoutMs);

  await Promise.all([firstSawSecond, secondSawFirst]);
  await proveSignedPing(first, second);

  console.log("[mdns] success: both local nodes discovered each other and exchanged a signed ping");
}

async function runAdvancedConnectivitySmoke(args: SmokeArgs): Promise<void> {
  if (args.bootstrapPeers.length === 0) {
    throw new Error("advanced mode requires at least one --bootstrap <multiaddr>");
  }

  const mesh = await startMesh({
    listen: args.listen,
    enableMdns: false,
    enableDht: true,
    dhtClientMode: true,
    bootstrapPeers: args.bootstrapPeers,
    enableRelay: true,
    enableAutoNat: true,
    enableDcutr: true,
  });
  const discoveredPeers: DiscoveredMeshPeer[] = [];

  mesh.onPeerDiscovered((peer) => {
    discoveredPeers.push(peer);
    console.log(`[advanced] discovered peer=${peer.peerId} addrs=${peer.multiaddrs.join(",")}`);
  });

  console.log(`[advanced] peer=${mesh.peerId}`);
  console.log(`[advanced] enabled=${mesh.enabledFeatures.join(",")}`);
  console.log("[advanced] listening:");
  for (const addr of mesh.multiaddrs) {
    console.log(`  ${addr}`);
  }

  await waitUntil(() => discoveredPeers.length > 0, args.timeoutMs, "Timed out waiting for bootstrap/DHT peer discovery");

  if (args.expectRelayAddress) {
    await waitUntil(
      () => mesh.multiaddrs.some((addr) => addr.includes("/p2p-circuit")),
      args.timeoutMs,
      "Timed out waiting for a relay /p2p-circuit address",
    );
  }

  console.log("[advanced] success: advanced connectivity stack started and discovered at least one peer");
  if (args.expectRelayAddress) {
    console.log("[advanced] success: relay address observed");
  }
}

async function proveSignedPing(sender: EnvoyMesh, receiver: EnvoyMesh): Promise<void> {
  const senderIdentity = generateIdentity();
  const received = new Promise<boolean>((resolve) => {
    const unsubscribe = receiver.onMessage(async ({ envelope }) => {
      unsubscribe();
      resolve(
        envelope.intent === "system.ping" &&
          envelope.senderPeerId === senderIdentity.peerId &&
          verifyEnvelope(envelope),
      );
    });
  });
  const unsigned = createUnsignedEnvelope({
    senderPeerId: senderIdentity.peerId,
    senderPublicKey: senderIdentity.publicKeyPem,
    recipientPeerId: receiver.peerId,
    intent: "system.ping",
    payload: createSystemPingPayload("connectivity smoke"),
  });

  await sender.send(receiver.multiaddrs[0], signUnsignedEnvelope(unsigned, senderIdentity.privateKeyPem));

  if (!(await withTimeout(received, 5000, "Timed out waiting for signed ping"))) {
    throw new Error("Signed ping was not verified by receiver");
  }
}

async function startMesh(options: ConstructorParameters<typeof EnvoyMesh>[0]): Promise<EnvoyMesh> {
  const mesh = new EnvoyMesh(options);
  await mesh.start();
  meshes.push(mesh);
  return mesh;
}

function waitForPeer(mesh: EnvoyMesh, expectedPeerId: string, timeoutMs: number): Promise<DiscoveredMeshPeer> {
  return withTimeout(
    new Promise((resolve) => {
      const unsubscribe = mesh.onPeerDiscovered((peer) => {
        if (peer.peerId === expectedPeerId) {
          unsubscribe();
          resolve(peer);
        }
      });
    }),
    timeoutMs,
    `Timed out waiting for peer ${expectedPeerId}`,
  );
}

async function waitUntil(
  predicate: () => boolean,
  timeoutMs: number,
  timeoutMessage: string,
): Promise<void> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (predicate()) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error(timeoutMessage);
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

function parseSmokeArgs(argv: string[]): SmokeArgs {
  const args: SmokeArgs = {
    mode: "mdns",
    timeoutMs: 15000,
    listen: ["/ip4/0.0.0.0/tcp/0"],
    mdnsIntervalMs: 500,
    bootstrapPeers: [],
    expectRelayAddress: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--mode") {
      args.mode = parseMode(readValue(argv, ++index, arg));
    } else if (arg === "--timeout-ms") {
      args.timeoutMs = Number(readValue(argv, ++index, arg));
    } else if (arg === "--listen") {
      args.listen = [readValue(argv, ++index, arg)];
    } else if (arg === "--mdns-interval-ms") {
      args.mdnsIntervalMs = Number(readValue(argv, ++index, arg));
    } else if (arg === "--bootstrap") {
      args.bootstrapPeers.push(readValue(argv, ++index, arg));
    } else if (arg === "--expect-relay-address") {
      args.expectRelayAddress = true;
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function parseMode(value: string): SmokeArgs["mode"] {
  if (value === "mdns" || value === "advanced") {
    return value;
  }

  throw new Error(`Invalid smoke mode: ${value}`);
}

function readValue(argv: string[], index: number, flag: string): string {
  const value = argv[index];

  if (!value) {
    throw new Error(`Missing value for ${flag}`);
  }

  return value;
}

function printHelp(): void {
  console.log(`EnvoyMesh connectivity smoke tests

Usage:
  npm run connectivity:smoke -w @envoymesh/node -- --mode mdns
  npm run connectivity:smoke -w @envoymesh/node -- --mode advanced --bootstrap <multiaddr>

Options:
  --mode <mdns|advanced>       Smoke mode. Default: mdns
  --listen <multiaddr>         Listen address. Default: /ip4/0.0.0.0/tcp/0
  --timeout-ms <ms>            Timeout. Default: 15000
  --mdns-interval-ms <ms>      mDNS query interval for mdns mode. Default: 500
  --bootstrap <multiaddr>      Bootstrap peer for advanced mode. Repeatable.
  --expect-relay-address       Require a /p2p-circuit address in advanced mode.
`);
}
