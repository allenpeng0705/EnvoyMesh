/**
 * Fleet bootstrap — declarative config for headless fleet apply.
 *
 * Operators describe nodes + shared settings in `fleet.yaml` / `fleet.json`,
 * then run `npm run fleet:apply -- --file fleet.yaml`. The apply script talks
 * JSON-RPC to each node's Social WS and reuses existing RPCs
 * (updateNodeConfig, createFleetManifest, createCompanyInvite, …).
 *
 * Secrets should be env refs (`tokenRef: LAN_FLEET_TOKEN`), not inline values.
 */
import { z } from "zod";

const SecretOrRefSchema = z
  .object({
    /** Inline secret (discouraged; prefer `*Ref`). */
    token: z.string().min(8).optional(),
    /** Environment variable name holding the secret. */
    tokenRef: z.string().min(1).optional(),
  })
  .refine((v) => Boolean(v.token?.trim() || v.tokenRef?.trim()), {
    message: "Provide token or tokenRef",
  });

export const FleetBootstrapNodeJoinSchema = z.object({
  /**
   * How this node obtains fleet trust:
   * - `lan` — shared LAN Auto-Bond token (office Wi-Fi)
   * - `manifest` — included in sponsor-signed Fleet Manifest
   * - `invite` — sponsor mints a company invite; member redeems (or URI is written out)
   * - `none` — config only; trust handled out-of-band
   */
  method: z.enum(["lan", "manifest", "invite", "none"]).default("lan"),
  trustLevel: z.enum(["direct", "referred", "public"]).default("direct"),
  /** Role label stored on Fleet Manifest members (Path B). */
  manifestRole: z.string().min(1).max(64).default("member"),
});

export const FleetBootstrapNodeIdentitySchema = z.object({
  ownerId: z.string().min(1).optional(),
  deviceId: z.string().min(1).optional(),
  devicePublicKeyPem: z.string().min(1).optional(),
  displayName: z.string().max(128).optional(),
  /** When identity fields are missing, call `getProfile` on the live node. */
  fetchIfMissing: z.boolean().default(true),
});

export const FleetBootstrapNodeSchema = z.object({
  id: z.string().min(1).max(64),
  role: z.enum(["sponsor", "member"]).default("member"),
  rpc: z.object({
    /** Social / NodeService WebSocket URL, e.g. ws://127.0.0.1:3030/ws */
    wsUrl: z.string().min(1),
  }),
  identity: FleetBootstrapNodeIdentitySchema.optional(),
  join: FleetBootstrapNodeJoinSchema.optional(),
  /** Merged into `updateNodeConfig` after shared settings (per-node overrides). */
  overrides: z.record(z.string(), z.unknown()).optional(),
});

export const FleetBootstrapSharedSchema = z.object({
  lanAutoBond: z
    .object({
      enabled: z.boolean(),
      token: z.string().min(8).optional(),
      tokenRef: z.string().min(1).optional(),
    })
    .refine((v) => !v.enabled || Boolean(v.token?.trim() || v.tokenRef?.trim()), {
      message: "lanAutoBond.enabled requires token or tokenRef",
    })
    .optional(),
  membership: z
    .object({
      capabilityProviderEnabled: z.boolean(),
    })
    .optional(),
  bondAutonomy: z
    .object({
      enabled: z.boolean(),
      sponsorProofToken: z.string().min(8).optional(),
      sponsorProofTokenRef: z.string().min(1).optional(),
      maxAutoBondsPerDay: z.number().int().positive().optional(),
    })
    .optional(),
});

export const FleetBootstrapApplyStepsSchema = z.enum([
  "patchNodeConfig",
  "ensureOnline",
  "createOrImportManifest",
  "mintInvites",
  "redeemInvites",
  "refreshAgentNetworkWorkers",
  "verifyRoster",
]);

export const FleetBootstrapSchema = z.object({
  version: z.literal("0.1"),
  fleetId: z.string().min(1).max(128),
  shared: FleetBootstrapSharedSchema.default({}),
  bootstrap: z
    .object({
      peers: z.array(z.string()).optional(),
      presets: z.array(z.string()).optional(),
    })
    .optional(),
  nodes: z.array(FleetBootstrapNodeSchema).min(1).max(256),
  apply: z
    .object({
      steps: z.array(FleetBootstrapApplyStepsSchema).optional(),
      /** When true, print planned RPC calls without executing. */
      dryRun: z.boolean().optional(),
      /** Write minted invite URIs here (JSON). Default: fleet-invites-<fleetId>.json */
      inviteOutFile: z.string().optional(),
      /** Seconds to wait for node:online-ish profile fetch. */
      ensureOnlineTimeoutSec: z.number().int().positive().default(30),
    })
    .optional(),
});

export type FleetBootstrap = z.infer<typeof FleetBootstrapSchema>;
export type FleetBootstrapNode = z.infer<typeof FleetBootstrapNodeSchema>;
export type FleetBootstrapApplyStep = z.infer<typeof FleetBootstrapApplyStepsSchema>;

export const DEFAULT_FLEET_APPLY_STEPS: FleetBootstrapApplyStep[] = [
  "ensureOnline",
  "patchNodeConfig",
  "createOrImportManifest",
  "mintInvites",
  "redeemInvites",
  "refreshAgentNetworkWorkers",
  "verifyRoster",
];

export function parseFleetBootstrap(input: unknown): FleetBootstrap {
  return FleetBootstrapSchema.parse(input);
}

export function resolveSecret(
  value: string | undefined,
  ref: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
  label = "secret",
): string | undefined {
  if (value?.trim()) return value.trim();
  if (!ref?.trim()) return undefined;
  const fromEnv = env[ref.trim()];
  if (!fromEnv?.trim()) {
    throw new Error(`${label}: env ${ref.trim()} is missing or empty`);
  }
  return fromEnv.trim();
}

/** Resolve shared secrets (LAN token, sponsor proof) against `env`. */
export function resolveFleetSecrets(
  bootstrap: FleetBootstrap,
  env: NodeJS.ProcessEnv = process.env,
): {
  lanFleetToken?: string;
  sponsorProofToken?: string;
} {
  const lan = bootstrap.shared.lanAutoBond;
  const autonomy = bootstrap.shared.bondAutonomy;
  return {
    lanFleetToken: lan
      ? resolveSecret(lan.token, lan.tokenRef, env, "lanAutoBond")
      : undefined,
    sponsorProofToken: autonomy
      ? resolveSecret(
          autonomy.sponsorProofToken,
          autonomy.sponsorProofTokenRef,
          env,
          "bondAutonomy.sponsorProofToken",
        )
      : undefined,
  };
}

/**
 * Build the `updateNodeConfig` patch for one node from shared + overrides.
 * Does not include identity fields.
 */
export function buildNodeConfigPatch(
  bootstrap: FleetBootstrap,
  node: FleetBootstrapNode,
  secrets: { lanFleetToken?: string; sponsorProofToken?: string },
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};

  if (bootstrap.shared.membership) {
    patch.capabilityProviderEnabled =
      bootstrap.shared.membership.capabilityProviderEnabled;
  }

  if (bootstrap.shared.lanAutoBond) {
    patch.lanAutoBondEnabled = bootstrap.shared.lanAutoBond.enabled;
    if (secrets.lanFleetToken) {
      patch.lanAutoBondFleetToken = secrets.lanFleetToken;
    }
  }

  if (bootstrap.shared.bondAutonomy && node.role === "sponsor") {
    patch.bondAutonomyEnabled = bootstrap.shared.bondAutonomy.enabled;
    if (secrets.sponsorProofToken) {
      patch.bondAutonomySponsorProofToken = secrets.sponsorProofToken;
    }
    if (bootstrap.shared.bondAutonomy.maxAutoBondsPerDay != null) {
      patch.bondAutonomyMaxAutoBondsPerDay =
        bootstrap.shared.bondAutonomy.maxAutoBondsPerDay;
    }
  }

  if (bootstrap.bootstrap?.peers?.length) {
    patch.bootstrapPeers = bootstrap.bootstrap.peers;
  }
  if (bootstrap.bootstrap?.presets?.length) {
    patch.bootstrapPresets = bootstrap.bootstrap.presets;
  }

  if (node.overrides) {
    Object.assign(patch, node.overrides);
  }

  return patch;
}

export interface ResolvedNodeIdentity {
  ownerId: string;
  deviceId: string;
  devicePublicKeyPem: string;
  displayName?: string;
}

/** True when YAML identity is complete enough for Fleet Manifest membership. */
export function identityIsComplete(
  identity: FleetBootstrapNode["identity"] | ResolvedNodeIdentity | undefined,
): identity is ResolvedNodeIdentity {
  return Boolean(
    identity?.ownerId?.trim() &&
      identity?.deviceId?.trim() &&
      identity?.devicePublicKeyPem?.trim(),
  );
}

export function sponsorNode(bootstrap: FleetBootstrap): FleetBootstrapNode {
  const sponsors = bootstrap.nodes.filter((n) => n.role === "sponsor");
  if (sponsors.length === 0) {
    throw new Error("fleet bootstrap requires exactly one node with role: sponsor");
  }
  if (sponsors.length > 1) {
    throw new Error(
      `fleet bootstrap expects one sponsor; found ${sponsors.length}: ${sponsors.map((s) => s.id).join(", ")}`,
    );
  }
  return sponsors[0]!;
}

/** Members that should appear on the sponsor-signed Fleet Manifest. */
export function manifestMemberNodes(bootstrap: FleetBootstrap): FleetBootstrapNode[] {
  return bootstrap.nodes.filter((n) => {
    if (n.role === "sponsor") return false;
    const method = n.join?.method ?? "lan";
    return method === "manifest";
  });
}

/** Members that should receive a company invite from the sponsor. */
export function inviteMemberNodes(bootstrap: FleetBootstrap): FleetBootstrapNode[] {
  return bootstrap.nodes.filter((n) => (n.join?.method ?? "lan") === "invite");
}

// Keep SecretOrRefSchema referenced so tree-shaking tools don't drop the export shape.
void SecretOrRefSchema;
