// Connect to the community relay, attempt reservation, see what happens.
import { createLibp2p } from "libp2p";
import { noise } from "@chainsafe/libp2p-noise";
import { yamux } from "@chainsafe/libp2p-yamux";
import { tcp } from "@libp2p/tcp";
import { webSockets } from "@libp2p/websockets";
import { circuitRelayTransport } from "@libp2p/circuit-relay-v2";
import { identify } from "@libp2p/identify";
import { ping } from "@libp2p/ping";
import { multiaddr } from "@multiformats/multiaddr";

const RELAY = "/ip4/47.93.11.212/tcp/4001/p2p/12D3KooWLNR4WYWHBswe8ux5zWsy6cuGywnYPJbdbaAbbpmJMjbo";

const HARD_TIMEOUT = setTimeout(() => { console.log("\nHARD TIMEOUT 90s"); process.exit(2); }, 90_000);

const node = await createLibp2p({
  connectionManager: { dialTimeout: 30_000, addressDialTimeout: 30_000 },
  addresses: { listen: ["/ip4/127.0.0.1/tcp/0"] },
  transports: [tcp(), webSockets(), circuitRelayTransport({ reservationCompletionTimeout: 30_000 })],
  connectionEncrypters: [noise()],
  streamMuxers: [yamux()],
  services: { ping: ping(), identify: identify() },
});

const start = Date.now();
const log = (msg) => console.log(`[T+${Date.now() - start}ms] ${msg}`);

node.addEventListener("relay:reservation", (e) => log(`relay:reservation — ${e.detail?.relayPeerId?.toString()}`));
node.addEventListener("relay:reservation:error", (e) => log(`relay:reservation:error — ${e.detail?.message ?? e.detail}`));
node.addEventListener("relay:advert:success", () => log(`relay:advert:success`));
node.addEventListener("relay:advert:error", (e) => log(`relay:advert:error — ${e.detail?.message ?? e.detail}`));
node.addEventListener("peer:connect", (e) => log(`peer:connect — ${e.detail?.toString()}`));
node.addEventListener("peer:disconnect", (e) => log(`peer:disconnect — ${e.detail?.toString()}`));

log(`node created, peerId=${node.peerId.toString()}`);
await node.start();
log(`node started`);

// First: just dial the relay and see what the relay says.
try {
  log(`dialing relay directly (TCP)...`);
  const conn = await node.dial(multiaddr(RELAY));
  log(`dial succeeded! remotePeer=${conn.remotePeer.toString()}, remoteAddr=${conn.remoteAddr?.toString()}`);
  
  // Now try to identify the relay to see its protocols
  log(`opening identify stream...`);
  const { identify } = await import("@libp2p/identify");
  const stream = await conn.newStream(["/ipfs/0.1.0/identify/1.0.0"]);
  log(`identify stream opened`);
  
  // Wait for reservation to fire.
  await new Promise((r) => setTimeout(r, 35_000));
} catch (err) {
  log(`dial FAILED: ${err.message}`);
  await new Promise((r) => setTimeout(r, 30_000));
}

log("END");
clearTimeout(HARD_TIMEOUT);
await node.stop();
process.exit(0);
