/**
 * Process 1: mock OpenClaw Gateway webhook (auto-replies via EnvoyMesh /bridge/send).
 */
import { startMockOpenClawGateway } from "./mock-gateway.js";

function requireArg(name: string): string {
  const idx = process.argv.indexOf(name);
  const value = idx >= 0 ? process.argv[idx + 1] : undefined;
  if (!value?.trim()) {
    console.error(`Missing ${name}`);
    process.exit(2);
  }
  return value.trim();
}

const gatewayPort = Number(requireArg("--gateway-port"));
const bridgePort = Number(requireArg("--bridge-port"));
const secret = process.env.ENVOYMESH_BRIDGE_SMOKE_SECRET ?? "envoymesh-smoke-secret";

const gateway = await startMockOpenClawGateway({
  port: gatewayPort,
  bridgeSendUrl: `http://127.0.0.1:${bridgePort}/bridge/send`,
  bridgeSecret: secret,
  replyText: process.env.ENVOYMESH_BRIDGE_SMOKE_REPLY ?? "openclaw smoke reply",
});

process.stdout.write(`ready gateway=${gateway.url}\n`);

function shutdown() {
  void gateway.close().finally(() => process.exit(0));
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
