/**
 * Reserve on cn-relay, then have a second ephemeral mesh dial us via circuit.
 * Proves whether RESERVE actually lands server-side.
 *   npx tsx scripts/probe-relay-reserve-roundtrip.ts
 */
import { EnvoyMesh } from "../packages/network/src/index.ts";

const RELAY =
  process.env.TEST_RELAY_ADDR ||
  "/ip4/47.93.11.212/tcp/4001/p2p/12D3KooWLNR4WYWHBswe8ux5zWsy6cuGywnYPJbdbaAbbpmJMjbo";

async function main(): Promise<void> {
  const home = new EnvoyMesh({
    listen: ["/ip4/127.0.0.1/tcp/0"],
    enableMdns: false,
    enableRelay: true,
    bootstrapPeers: [RELAY],
    configuredRelays: [RELAY],
    enableP2pDebug: true,
  });
  await home.start();
  console.log("home peer", home.peerId);
  console.log("eager", await home.eagerConnectToRelays([RELAY], { timeoutMs: 15_000 }));
  console.log("reserve", await home.requestRelayReservation([RELAY]));
  console.log(
    "local hasLive",
    home.hasLiveRelayReservation(["12D3KooWLNR4WYWHBswe8ux5zWsy6cuGywnYPJbdbaAbbpmJMjbo"]),
  );
  console.log("local inspect", home.inspectCircuitRelayReservations());
  console.log("status", home.getRelayReservationStatus());
  await new Promise((r) => setTimeout(r, 1500));
  console.log("home multiaddrs", home.getMultiaddrs?.() ?? "(no getMultiaddrs)");

  const joiner = new EnvoyMesh({
    listen: ["/ip4/127.0.0.1/tcp/0"],
    enableMdns: false,
    enableRelay: true,
    bootstrapPeers: [RELAY],
    enableP2pDebug: true,
  });
  await joiner.start();
  console.log("joiner peer", joiner.peerId);
  console.log("joiner eager", await joiner.eagerConnectToRelays([RELAY], { timeoutMs: 15_000 }));
  const circuit = `${RELAY}/p2p-circuit/p2p/${home.peerId}`;
  console.log("dialing", circuit);
  const t0 = Date.now();
  try {
    await Promise.race([
      joiner.dial(circuit),
      new Promise<never>((_, rej) =>
        setTimeout(() => rej(new Error("dial timeout 15s")), 15_000),
      ),
    ]);
    console.log(`ROUNDTRIP OK in ${Date.now() - t0}ms`, joiner.getPeerConnectionInfo(home.peerId));
  } catch (e) {
    console.error(`ROUNDTRIP FAIL in ${Date.now() - t0}ms:`, e instanceof Error ? e.message : e);
    process.exitCode = 1;
  }
  await joiner.stop().catch(() => undefined);
  await home.stop().catch(() => undefined);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
