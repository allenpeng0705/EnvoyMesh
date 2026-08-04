/**
 * One-shot: dial Allen Mac via community relay /p2p-circuit/.
 *   npx tsx scripts/probe-circuit-dial-to-allen.ts
 */
import { EnvoyMesh } from "../packages/network/src/index.ts";

const RELAY =
  process.env.TEST_RELAY_ADDR ||
  "/ip4/47.93.11.212/tcp/4001/p2p/12D3KooWLNR4WYWHBswe8ux5zWsy6cuGywnYPJbdbaAbbpmJMjbo";
const ALLEN =
  process.env.ALLEN_PEER_ID ||
  "12D3KooWQsD3ougrAJjmKeevSiY2azE5CKqLjcijyYreS6fUFYCR";
const CIRCUIT = `${RELAY}/p2p-circuit/p2p/${ALLEN}`;
const DIAL_MS = Number(process.env.DIAL_TIMEOUT_MS || 20_000);

async function main(): Promise<void> {
  console.log("Circuit dial probe");
  console.log(`  relay=${RELAY}`);
  console.log(`  target=${ALLEN}`);
  console.log(`  circuit=${CIRCUIT}`);
  console.log(`  dialTimeoutMs=${DIAL_MS}`);

  const mesh = new EnvoyMesh({
    listen: ["/ip4/127.0.0.1/tcp/0"],
    enableMdns: false,
    enableRelay: true,
    bootstrapPeers: [RELAY],
    enableP2pDebug: true,
  });

  const t0 = Date.now();
  const ms = () => `${Date.now() - t0}ms`;
  try {
    await mesh.start();
    console.log(`[${ms()}] started`);
    const eager = await mesh.eagerConnectToRelays([RELAY], { timeoutMs: 15_000 });
    console.log(`[${ms()}] eagerConnect`, JSON.stringify(eager));

    const dialStarted = Date.now();
    try {
      await Promise.race([
        mesh.dial(CIRCUIT),
        new Promise<never>((_, rej) =>
          setTimeout(() => rej(new Error(`dial timeout (${DIAL_MS}ms)`)), DIAL_MS),
        ),
      ]);
      console.log(
        `[${ms()}] DIAL OK in ${Date.now() - dialStarted}ms`,
        mesh.getPeerConnectionInfo(ALLEN),
      );
    } catch (e) {
      console.error(
        `[${ms()}] DIAL FAIL in ${Date.now() - dialStarted}ms:`,
        e instanceof Error ? e.message : e,
      );
      process.exitCode = 1;
    }
  } finally {
    await mesh.stop().catch(() => undefined);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
