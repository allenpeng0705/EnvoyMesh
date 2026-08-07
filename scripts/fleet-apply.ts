/**
 * Headless fleet apply — reads fleet.yaml / fleet.json and drives existing
 * NodeService JSON-RPC methods over each node's Social WebSocket.
 *
 * Usage:
 *   npm run fleet:apply -- --file fleet.yaml
 *   npm run fleet:apply -- --file fleet.yaml --dry-run
 *   LAN_FLEET_TOKEN=… SPONSOR_TOKEN=… npm run fleet:apply -- --file fleet.yaml
 */
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import WebSocket from "ws";
import { parse as parseYaml } from "yaml";
import {
  DEFAULT_FLEET_APPLY_STEPS,
  buildNodeConfigPatch,
  identityIsComplete,
  inviteMemberNodes,
  manifestMemberNodes,
  parseFleetBootstrap,
  resolveFleetSecrets,
  sponsorNode,
  type FleetBootstrap,
  type FleetBootstrapApplyStep,
  type FleetBootstrapNode,
  type ResolvedNodeIdentity,
} from "../packages/api/src/fleet-bootstrap.js";

const RPC_TIMEOUT_MS = 20_000;

type RpcResult = unknown;

async function rpc(
  wsUrl: string,
  method: string,
  params: Record<string, unknown> = {},
  timeoutMs = RPC_TIMEOUT_MS,
): Promise<RpcResult> {
  return new Promise((resolvePromise, reject) => {
    const ws = new WebSocket(wsUrl, { handshakeTimeout: timeoutMs });
    const id = 1;
    let settled = false;
    const deadline = setTimeout(() => {
      if (settled) return;
      settled = true;
      ws.terminate();
      reject(new Error(`RPC timeout ${method} @ ${wsUrl}`));
    }, timeoutMs);

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      fn();
    };

    ws.on("open", () => {
      ws.send(JSON.stringify({ jsonrpc: "2.0", id, method, params }));
    });
    ws.on("message", (data) => {
      let msg: { event?: string; id?: number; result?: unknown; error?: { message?: string } };
      try {
        msg = JSON.parse(data.toString());
      } catch {
        return;
      }
      if (msg.event && msg.id === undefined) return;
      if (msg.id !== id) return;
      finish(() => {
        ws.close();
        if (msg.error) {
          reject(new Error(msg.error.message ?? JSON.stringify(msg.error)));
        } else {
          resolvePromise(msg.result);
        }
      });
    });
    ws.on("error", (err) => {
      finish(() => reject(err));
    });
  });
}

async function loadFleetFile(path: string): Promise<unknown> {
  const raw = await readFile(path, "utf8");
  const lower = path.toLowerCase();
  if (lower.endsWith(".yaml") || lower.endsWith(".yml")) {
    return parseYaml(raw);
  }
  return JSON.parse(raw);
}

function log(msg: string): void {
  console.log(msg);
}

function parseArgs(argv: string[]): {
  file?: string;
  dryRun: boolean;
  steps?: FleetBootstrapApplyStep[];
  help: boolean;
} {
  let file: string | undefined;
  let dryRun = false;
  let help = false;
  let steps: FleetBootstrapApplyStep[] | undefined;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--help" || a === "-h") help = true;
    else if (a === "--dry-run") dryRun = true;
    else if (a === "--file" || a === "-f") file = argv[++i];
    else if (a === "--steps") {
      const raw = argv[++i] ?? "";
      steps = raw.split(",").map((s) => s.trim()).filter(Boolean) as FleetBootstrapApplyStep[];
    } else if (!a.startsWith("-") && !file) {
      file = a;
    }
  }
  return { file, dryRun, steps, help };
}

async function resolveIdentity(
  node: FleetBootstrapNode,
  dryRun: boolean,
): Promise<ResolvedNodeIdentity> {
  const base = node.identity;
  if (identityIsComplete(base)) {
    return {
      ownerId: base.ownerId!,
      deviceId: base.deviceId!,
      devicePublicKeyPem: base.devicePublicKeyPem!,
      displayName: base.displayName,
    };
  }
  const fetchIfMissing = base?.fetchIfMissing !== false;
  if (!fetchIfMissing) {
    throw new Error(
      `node ${node.id}: identity incomplete and fetchIfMissing=false`,
    );
  }
  if (dryRun) {
    throw new Error(
      `node ${node.id}: identity incomplete — dry-run cannot fetchProfile; fill identity in fleet file`,
    );
  }
  const profile = (await rpc(node.rpc.wsUrl, "getProfile")) as {
    owner?: { ownerId?: string };
    device?: { deviceId?: string; publicKeyPem?: string };
    humanProfile?: { displayName?: string };
  } | null;
  const ownerId = base?.ownerId ?? profile?.owner?.ownerId;
  const deviceId = base?.deviceId ?? profile?.device?.deviceId;
  const devicePublicKeyPem =
    base?.devicePublicKeyPem ?? profile?.device?.publicKeyPem;
  if (!ownerId || !deviceId || !devicePublicKeyPem) {
    throw new Error(
      `node ${node.id}: getProfile did not return ownerId/deviceId/devicePublicKeyPem`,
    );
  }
  return {
    ownerId,
    deviceId,
    devicePublicKeyPem,
    displayName: base?.displayName ?? profile?.humanProfile?.displayName,
  };
}

async function stepEnsureOnline(
  bootstrap: FleetBootstrap,
  dryRun: boolean,
): Promise<void> {
  const timeoutSec = bootstrap.apply?.ensureOnlineTimeoutSec ?? 30;
  for (const node of bootstrap.nodes) {
    if (dryRun) {
      log(`[dry-run] ensureOnline ${node.id} @ ${node.rpc.wsUrl}`);
      continue;
    }
    const deadline = Date.now() + timeoutSec * 1000;
    let lastErr: unknown;
    while (Date.now() < deadline) {
      try {
        await rpc(node.rpc.wsUrl, "getProfile", {}, 5_000);
        log(`[ok] ensureOnline ${node.id}`);
        lastErr = undefined;
        break;
      } catch (err) {
        lastErr = err;
        await new Promise((r) => setTimeout(r, 1_000));
      }
    }
    if (lastErr) {
      throw new Error(
        `ensureOnline failed for ${node.id}: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`,
      );
    }
  }
}

async function stepPatchNodeConfig(
  bootstrap: FleetBootstrap,
  secrets: { lanFleetToken?: string; sponsorProofToken?: string },
  dryRun: boolean,
): Promise<void> {
  for (const node of bootstrap.nodes) {
    const patch = buildNodeConfigPatch(bootstrap, node, secrets);
    if (Object.keys(patch).length === 0) {
      log(`[skip] patchNodeConfig ${node.id} (empty patch)`);
      continue;
    }
    if (dryRun) {
      log(`[dry-run] updateNodeConfig ${node.id} ${JSON.stringify(patch)}`);
      continue;
    }
    await rpc(node.rpc.wsUrl, "updateNodeConfig", patch);
    log(`[ok] patchNodeConfig ${node.id}`);
  }
}

async function stepCreateOrImportManifest(
  bootstrap: FleetBootstrap,
  dryRun: boolean,
): Promise<void> {
  const members = manifestMemberNodes(bootstrap);
  if (members.length === 0) {
    log("[skip] createOrImportManifest (no join.method=manifest members)");
    return;
  }
  const sponsor = sponsorNode(bootstrap);
  const fleetMembers = [];
  for (const node of members) {
    const id = await resolveIdentity(node, dryRun);
    fleetMembers.push({
      ownerId: id.ownerId,
      deviceId: id.deviceId,
      devicePublicKeyPem: id.devicePublicKeyPem,
      role: node.join?.manifestRole ?? "member",
      trustLevel: node.join?.trustLevel ?? "direct",
      displayName: id.displayName ?? node.id,
      note: `fleet-bootstrap:${bootstrap.fleetId}`,
    });
  }
  const createParams = {
    label: bootstrap.fleetId,
    members: fleetMembers,
  };
  if (dryRun) {
    log(`[dry-run] createFleetManifest on ${sponsor.id} members=${fleetMembers.length}`);
    for (const m of members) {
      log(`[dry-run] importFleetManifest on ${m.id}`);
    }
    return;
  }
  const created = (await rpc(sponsor.rpc.wsUrl, "createFleetManifest", createParams)) as {
    ok?: boolean;
    manifest?: unknown;
    reason?: string;
    detail?: string;
  };
  if (created && created.ok === false) {
    throw new Error(
      `createFleetManifest failed: ${created.reason ?? "unknown"} ${created.detail ?? ""}`,
    );
  }
  const manifest = (created as { manifest: unknown }).manifest ?? created;
  log(`[ok] createFleetManifest on ${sponsor.id}`);

  for (const node of [...members, sponsor]) {
    const result = (await rpc(node.rpc.wsUrl, "importFleetManifest", {
      manifest,
      force: false,
    })) as { ok?: boolean; reason?: string; detail?: string; added?: number };
    if (result && result.ok === false) {
      // Already-imported on sponsor after create is fine.
      log(
        `[warn] importFleetManifest ${node.id}: ${result.reason ?? "failed"} ${result.detail ?? ""}`,
      );
      continue;
    }
    log(`[ok] importFleetManifest ${node.id} added=${result?.added ?? "?"}`);
  }
}

async function stepMintInvites(
  bootstrap: FleetBootstrap,
  dryRun: boolean,
): Promise<Array<{ nodeId: string; uri: string; token: string }>> {
  const invitees = inviteMemberNodes(bootstrap);
  if (invitees.length === 0) {
    log("[skip] mintInvites (no join.method=invite members)");
    return [];
  }
  const sponsor = sponsorNode(bootstrap);
  const minted: Array<{ nodeId: string; uri: string; token: string }> = [];
  for (const node of invitees) {
    if (dryRun) {
      log(`[dry-run] createCompanyInvite for ${node.id} on ${sponsor.id}`);
      continue;
    }
    const result = (await rpc(sponsor.rpc.wsUrl, "createCompanyInvite", {
      expiresInHours: 168,
      note: `fleet-bootstrap:${bootstrap.fleetId}:${node.id}`,
    })) as { invite?: { token?: string }; uri?: string };
    const uri = result.uri;
    const token = result.invite?.token;
    if (!uri || !token) {
      throw new Error(`createCompanyInvite for ${node.id} returned no uri/token`);
    }
    minted.push({ nodeId: node.id, uri, token });
    log(`[ok] mintInvites ${node.id}`);
  }

  if (!dryRun && minted.length > 0) {
    const out =
      bootstrap.apply?.inviteOutFile ??
      resolve(process.cwd(), `fleet-invites-${bootstrap.fleetId}.json`);
    await writeFile(out, JSON.stringify({ fleetId: bootstrap.fleetId, minted }, null, 2));
    log(`[ok] wrote invite URIs → ${out}`);
  }
  return minted;
}

async function stepRedeemInvites(
  bootstrap: FleetBootstrap,
  minted: Array<{ nodeId: string; uri: string; token: string }>,
  dryRun: boolean,
): Promise<void> {
  if (minted.length === 0 && inviteMemberNodes(bootstrap).length === 0) {
    log("[skip] redeemInvites");
    return;
  }
  if (dryRun) {
    for (const m of inviteMemberNodes(bootstrap)) {
      log(`[dry-run] redeemCompanyInvite on ${m.id}`);
    }
    return;
  }
  const byId = new Map(minted.map((m) => [m.nodeId, m]));
  for (const node of inviteMemberNodes(bootstrap)) {
    const row = byId.get(node.id);
    if (!row) {
      log(`[warn] redeemInvites ${node.id}: no minted invite in this run`);
      continue;
    }
    // Parse wsUrl from URI if present so redeem can dial the sponsor.
    let wsUrl: string | undefined;
    try {
      const u = new URL(row.uri.replace(/^envoy:/, "https:"));
      wsUrl = u.searchParams.get("wsUrl") ?? undefined;
    } catch {
      /* ignore */
    }
    await rpc(node.rpc.wsUrl, "redeemCompanyInvite", {
      token: row.token,
      wsUrl,
      helloMessage: `fleet-bootstrap ${bootstrap.fleetId}`,
    });
    log(`[ok] redeemInvites ${node.id}`);
  }
}

async function stepRefreshWorkers(
  bootstrap: FleetBootstrap,
  dryRun: boolean,
): Promise<void> {
  for (const node of bootstrap.nodes) {
    if (dryRun) {
      log(`[dry-run] refreshAgentNetworkWorkers ${node.id}`);
      continue;
    }
    try {
      const result = await rpc(node.rpc.wsUrl, "refreshAgentNetworkWorkers");
      log(`[ok] refreshAgentNetworkWorkers ${node.id} ${JSON.stringify(result)}`);
    } catch (err) {
      log(
        `[warn] refreshAgentNetworkWorkers ${node.id}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}

async function stepVerifyRoster(
  bootstrap: FleetBootstrap,
  dryRun: boolean,
): Promise<void> {
  for (const node of bootstrap.nodes) {
    if (dryRun) {
      log(`[dry-run] verifyRoster ${node.id}`);
      continue;
    }
    const bonds = (await rpc(node.rpc.wsUrl, "getBonds")) as Array<{
      peerOwnerId?: string;
      level?: string;
    }>;
    const cards = (await rpc(node.rpc.wsUrl, "listAgentCards")) as Array<{
      ownerId?: string;
      membership?: string[];
    }>;
    const bondList = Array.isArray(bonds) ? bonds : [];
    const cardList = Array.isArray(cards) ? cards : [];
    const workers = cardList.filter((c) =>
      (c.membership ?? []).includes("agent-network-worker"),
    );
    log(
      `[ok] verifyRoster ${node.id}: bonds=${bondList.length} cards=${cardList.length} workers=${workers.length}`,
    );
  }
}

async function runSteps(
  bootstrap: FleetBootstrap,
  steps: FleetBootstrapApplyStep[],
  dryRun: boolean,
): Promise<void> {
  const secrets = resolveFleetSecrets(bootstrap);
  let minted: Array<{ nodeId: string; uri: string; token: string }> = [];

  for (const step of steps) {
    log(`\n==> ${step}`);
    switch (step) {
      case "ensureOnline":
        await stepEnsureOnline(bootstrap, dryRun);
        break;
      case "patchNodeConfig":
        await stepPatchNodeConfig(bootstrap, secrets, dryRun);
        break;
      case "createOrImportManifest":
        await stepCreateOrImportManifest(bootstrap, dryRun);
        break;
      case "mintInvites":
        minted = await stepMintInvites(bootstrap, dryRun);
        break;
      case "redeemInvites":
        await stepRedeemInvites(bootstrap, minted, dryRun);
        break;
      case "refreshAgentNetworkWorkers":
        await stepRefreshWorkers(bootstrap, dryRun);
        break;
      case "verifyRoster":
        await stepVerifyRoster(bootstrap, dryRun);
        break;
      default: {
        const _exhaustive: never = step;
        throw new Error(`unknown step ${_exhaustive}`);
      }
    }
  }
}

function printHelp(): void {
  console.log(`Usage: npm run fleet:apply -- --file <fleet.yaml|json> [--dry-run] [--steps a,b,c]

Applies a declarative fleet bootstrap file against running EnvoyMesh nodes
via Social WebSocket JSON-RPC.

Steps (default order):
  ${DEFAULT_FLEET_APPLY_STEPS.join(", ")}

Secrets: set env vars named by tokenRef / sponsorProofTokenRef in the fleet file.
Example: LAN_FLEET_TOKEN=… npm run fleet:apply -- --file fleet.yaml
`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.file) {
    printHelp();
    process.exit(args.help ? 0 : 1);
  }
  const path = resolve(process.cwd(), args.file);
  const raw = await loadFleetFile(path);
  const bootstrap = parseFleetBootstrap(raw);
  const dryRun = args.dryRun || bootstrap.apply?.dryRun === true;
  const steps =
    args.steps ??
    bootstrap.apply?.steps ??
    DEFAULT_FLEET_APPLY_STEPS;

  log(`Fleet ${bootstrap.fleetId} from ${path}${dryRun ? " (dry-run)" : ""}`);
  log(`Nodes: ${bootstrap.nodes.map((n) => `${n.id}:${n.role}`).join(", ")}`);
  log(`Steps: ${steps.join(" → ")}`);

  // Validate sponsor early.
  sponsorNode(bootstrap);

  await runSteps(bootstrap, steps, dryRun);
  log("\nDone.");
}

const isMain =
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1]!)).href;

if (isMain) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}

export { main, loadFleetFile, parseArgs };
