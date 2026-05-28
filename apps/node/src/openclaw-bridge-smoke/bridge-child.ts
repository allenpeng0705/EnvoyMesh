/**
 * Process 2: EnvoyMesh bridge HTTP server (createBridge) with smoke control inject.
 */
import { createServer, type IncomingMessage } from "node:http";
import { createAgentCredential, generateAgentIdentity, generateOwnerIdentity } from "@envoymesh/identity";
import { createChatMessagePayload } from "@envoymesh/protocol";
import { createBridge, type BridgeIdentity } from "../bridge/index.js";

function requireArg(name: string): string {
  const idx = process.argv.indexOf(name);
  const value = idx >= 0 ? process.argv[idx + 1] : undefined;
  if (!value?.trim()) {
    console.error(`Missing ${name}`);
    process.exit(2);
  }
  return value.trim();
}

const bridgePort = Number(requireArg("--bridge-port"));
const controlPort = Number(requireArg("--control-port"));
const agentUrl = requireArg("--agent-url");
const secret = process.env.ENVOYMESH_BRIDGE_SMOKE_SECRET ?? "envoymesh-smoke-secret";

const owner = generateOwnerIdentity();
const agent = generateAgentIdentity(owner.ownerId);
const identity: BridgeIdentity = {
  agentPeerId: agent.agentPeerId,
  agentPublicKeyPem: agent.publicKeyPem,
  agentPrivateKeyPem: agent.privateKeyPem,
  ownerId: owner.ownerId,
  agentCredential: createAgentCredential({
    owner,
    agent,
    scope: ["chat.message"],
  }),
};

let replySent = false;

const bridge = createBridge({
  config: {
    enabled: true,
    agentUrl,
    listenPort: bridgePort,
    secret,
    agentName: "OpenClaw Smoke",
  },
  identity,
  mesh: {
    peerId: "12D3SmokeSelf",
    sendChat: async (peerId: string, envelope: { payload?: { text?: string } }) => {
      replySent = true;
      const text = (envelope.payload as { text?: string } | undefined)?.text ?? "";
      process.stdout.write(`reply-sent peer=${peerId} text=${JSON.stringify(text)}\n`);
    },
  } as any,
  getRecipientPeerId: async (id: string) => id,
});

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c as Buffer));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

const controlServer = createServer(async (req, res) => {
  const path = (req.url ?? "").split("?")[0] ?? "";
  if (req.method === "GET" && path === "/smoke/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, replySent }));
    return;
  }
  if (req.method !== "POST" || path !== "/smoke/inject-chat") {
    res.writeHead(404).end();
    return;
  }
  try {
    const raw = await readBody(req);
    const body = JSON.parse(raw) as {
      senderPeerId?: string;
      senderOwnerId?: string;
      text?: string;
    };
    const senderPeerId = body.senderPeerId?.trim() ?? "envoy_peer_smoke";
    const senderOwnerId = body.senderOwnerId?.trim() ?? "envoy:owner:smoke";
    const text = body.text?.trim() ?? "smoke ping";
    replySent = false;
    await bridge._handleMessage(
      {
        intent: "chat.message",
        recipientPeerId: identity.agentPeerId,
        payload: createChatMessagePayload({
          senderOwnerId,
          text,
        }),
      },
      senderPeerId,
    );
    res.writeHead(202, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, accepted: true }));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: false, error: message }));
  }
});

await new Promise<void>((resolve) => controlServer.listen(controlPort, "127.0.0.1", () => resolve()));

process.stdout.write(
  `ready bridge=http://127.0.0.1:${bridgePort}/bridge/send control=http://127.0.0.1:${controlPort}\n`,
);

async function shutdown() {
  controlServer.close();
  await bridge.stop();
  process.exit(0);
}
process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
