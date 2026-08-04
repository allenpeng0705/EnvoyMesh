/**
 * Mint a 1-year wan-public installer invite from Allen's local node (WS :4030)
 * and rewrite bundled-sponsor-friend.json with no RFC1918 bootstrap.
 *
 *   npx tsx scripts/regenerate-bundled-sponsor-from-live-node.ts
 */
import { writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import WebSocket from "ws";
import {
  buildEnvoyContactUri,
  encodeWanJoinInviteV1,
} from "../packages/api/src/index.ts";

const WS_URL = process.env.ENVOYMESH_SOCIAL_WS_URL?.trim() || "ws://127.0.0.1:4030/ws";
const OUT = process.env.ENVOYMESH_BUNDLED_SPONSOR_FRIEND_OUT?.trim() || "bundled-sponsor-friend.json";
const EXPIRES_HOURS = 8760; // 1 year

type RpcResult = { result?: unknown; error?: { message?: string } };

async function rpc<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
  const ws = new WebSocket(WS_URL);
  await new Promise<void>((resolve, reject) => {
    ws.once("open", () => resolve());
    ws.once("error", reject);
  });
  const id = `regen-${Date.now()}`;
  const response = await new Promise<RpcResult>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("RPC timeout")), 30_000);
    ws.on("message", (data) => {
      try {
        const msg = JSON.parse(String(data)) as { id?: string } & RpcResult;
        if (msg.id !== id) return;
        clearTimeout(timer);
        resolve(msg);
      } catch (e) {
        clearTimeout(timer);
        reject(e);
      }
    });
    ws.send(JSON.stringify({ id, method, params }));
  });
  ws.close();
  if (response.error) {
    throw new Error(response.error.message ?? JSON.stringify(response.error));
  }
  return response.result as T;
}

function assertCleanInvite(invite: {
  targetMultiaddrs?: string[];
  bootstrapPeers?: string[];
  expiresAt?: string;
}): void {
  const addrs = [...(invite.targetMultiaddrs ?? []), ...(invite.bootstrapPeers ?? [])];
  const privateHit = addrs.find(
    (a) =>
      a.includes("/ip4/192.168.") ||
      a.includes("/ip4/10.") ||
      /\/ip4\/172\.(1[6-9]|2\d|3[01])\./.test(a) ||
      a.includes("/ip4/127."),
  );
  if (privateHit) {
    throw new Error(`invite still contains private addr: ${privateHit}`);
  }
  const hasPublicCircuit = (invite.targetMultiaddrs ?? []).some(
    (a) => a.includes("/p2p-circuit/") && a.includes("47.93.11.212"),
  );
  if (!hasPublicCircuit) {
    throw new Error("invite missing public cn-relay /p2p-circuit/ target multiaddr");
  }
  for (const b of invite.bootstrapPeers ?? []) {
    if (b.includes("192.168.") || b.includes("/ip4/10.") || /\/ip4\/172\.(1[6-9]|2\d|3[01])\./.test(b)) {
      throw new Error(`bootstrapPeers still private: ${b}`);
    }
    if (!b.startsWith("/")) {
      throw new Error(`bootstrapPeers must not include bare peer ids: ${b}`);
    }
  }
  const exp = invite.expiresAt ? Date.parse(invite.expiresAt) : NaN;
  if (!Number.isFinite(exp) || exp < Date.now() + 300 * 24 * 3600 * 1000) {
    throw new Error(`expiresAt too soon or missing: ${invite.expiresAt}`);
  }
}

async function main(): Promise<void> {
  const prev = JSON.parse(readFileSync(OUT, "utf8")) as {
    helloMessage?: string;
    proofOfContext?: string;
    maxAttempts?: number;
    retryDelayMs?: number;
  };

  console.log(`Minting createWanJoinInvite via ${WS_URL} (expiresInHours=${EXPIRES_HOURS})…`);
  const minted = await rpc<{
    token: string;
    uri: string;
    invite: {
      targetPeerId?: string;
      targetMultiaddrs: string[];
      bootstrapPeers: string[];
      bootstrapPresets?: string[];
      expiresAt?: string;
      createdAt?: string;
    };
  }>("createWanJoinInvite", {
    expiresInHours: EXPIRES_HOURS,
    addressFilter: "wan-public",
    compact: false,
    note: "installer-bundled-sponsor-friend",
  });

  console.log("createdAt", minted.invite.createdAt);
  console.log("expiresAt", minted.invite.expiresAt);
  console.log("targetMultiaddrs:");
  for (const a of minted.invite.targetMultiaddrs) console.log(" ", a);
  console.log("bootstrapPeers (raw mint):");
  for (const a of minted.invite.bootstrapPeers) console.log(" ", a);

  // Installer hygiene: bootstrapPeers = public cn-relay only (no bare peer ids,
  // no duplicates). Dial path stays in targetMultiaddrs (/p2p-circuit/).
  const COMMUNITY =
    "/ip4/47.93.11.212/tcp/4001/p2p/12D3KooWLNR4WYWHBswe8ux5zWsy6cuGywnYPJbdbaAbbpmJMjbo";
  const cleanedInvite = {
    ...minted.invite,
    v: 1 as const,
    bootstrapPeers: [COMMUNITY],
    bootstrapPresets: minted.invite.bootstrapPresets?.length
      ? minted.invite.bootstrapPresets
      : ["public-libp2p", "public-libp2p-am6", "public-libp2p-am7", "cn-relay"],
  };
  assertCleanInvite(cleanedInvite);
  const cleanToken = encodeWanJoinInviteV1(cleanedInvite);

  const profile = await rpc<{
    ownerId?: string;
    displayName?: string;
  } | null>("getHumanProfile", {});

  const peerId =
    minted.invite.targetPeerId ??
    (await rpc<{ peerId?: string }>("getProfile", {})).peerId;

  const contactUri = buildEnvoyContactUri({
    peerId,
    joinToken: cleanToken,
    displayName: profile?.displayName ?? "Allen Peng",
    ownerId: profile?.ownerId,
  });

  const payload = {
    enabled: true,
    contactUri,
    helloMessage: prev.helloMessage ?? "Hello!",
    proofOfContext: prev.proofOfContext ?? "EsPf9Kx2mN7vQ4wR8jL3hT6yB1cF5aZ8dG",
    maxAttempts: prev.maxAttempts ?? 12,
    retryDelayMs: prev.retryDelayMs ?? 5000,
  };

  await writeFile(OUT, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(`\nWrote ${OUT}`);
  console.log(`expiresAt=${cleanedInvite.expiresAt}`);
  console.log(`bootstrapPeers=${JSON.stringify(cleanedInvite.bootstrapPeers)}`);
  console.log(`targetMultiaddrs=${JSON.stringify(cleanedInvite.targetMultiaddrs)}`);
  console.log("OK — no RFC1918; public circuit present; expires ~1 year.");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
