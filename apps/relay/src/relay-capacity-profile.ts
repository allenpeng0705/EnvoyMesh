/**
 * Hardware-aware relay capacity — **bottleneck model → floor, not ceiling**.
 *
 * The formula computes a **conservative minimum** this host should sustain (floor).
 * libp2p caps use hardware ceilings (RAM/CPU breakdown); connections adapt at runtime.
 * Runtime adaptive feedback **starts at the floor** and grows when healthy —
 * real throughput discovers the ceiling, not the formula.
 */
import { cpus, totalmem } from "node:os";
import type { RelayArgs } from "./args.js";

const GB = 1024 * 1024 * 1024;
const KIB = 1024;

/** Product cap for public circuit-relay v2 (see PUBLIC_RELAY_V2_DEFAULTS). */
export const PUBLIC_MAX_RESERVATIONS_CAP = 1024;
export const PUBLIC_MAX_CONNECTIONS_CAP = 8192;
export const PRIVATE_MAX_RESERVATIONS_CAP = 512;

/** Reference hub: 2 vCPU / 4 GB — capacityScore ≈ 1.0 at this size. */
export const REFERENCE_RAM_GB = 4;
export const REFERENCE_CPU_COUNT = 2;

/**
 * Relay workload constants (public mode). Conservative — prefer stability over
 * oversubscribing a dimension we cannot measure live at startup.
 */
const CAPACITY_CONSTANTS_PUBLIC = {
  /** Fraction of system RAM budgeted for active home hop state. */
  ramFractionForHomes: 0.4,
  /** All-in bytes per reservation (store + conn overhead); ~384 KiB conservative. */
  bytesPerHomeHop: 384 * KIB,
  /** Sustainable active home hops per CPU core (checkin + renewal + lookup). */
  homesPerCpuCore: 200,
  /** libp2p TCP connections sustainable per GB RAM (table + buffers). */
  tcpConnsPerGbRam: 180,
  /** TCP connections sustainable per CPU core under swarm dial churn. */
  tcpConnsPerCpuCore: 280,
  /** CPU stress weight — lag often bites before RAM on public relays. */
  cpuStressWeight: 1.15,
  /** Extra TCP slots for anonymous swarm / sibling gossip (scales with CPU). */
  swarmConnBase: 64,
  swarmConnPerCpu: 24,
  /** TCP slots needed per active home (circuit + control). */
  tcpConnsPerHome: 1.2,
  /** RSS health-exit as fraction of system RAM. */
  rssFraction: 0.52,
  rssFractionMax: 0.68,
  rssFloorMb: 1536,
} as const;

const CAPACITY_CONSTANTS_PRIVATE = {
  ramFractionForHomes: 0.3,
  bytesPerHomeHop: 384 * KIB,
  homesPerCpuCore: 80,
  tcpConnsPerGbRam: 100,
  tcpConnsPerCpuCore: 120,
  cpuStressWeight: 1.1,
  swarmConnBase: 32,
  swarmConnPerCpu: 12,
  tcpConnsPerHome: 1.15,
  rssFraction: 0.42,
  rssFractionMax: 0.55,
  rssFloorMb: 1024,
} as const;

export type RelayCapacityTier = "small" | "medium" | "large" | "xlarge";
export type RelayCapacityBottleneck = "ram" | "cpu" | "balanced";

export interface RelayHostHardware {
  cpuCount: number;
  ramBytes: number;
  ramGb: number;
}

export interface RelayCapacityBreakdown {
  /** Which dimension limited maxReservations. */
  reservationsBottleneck: RelayCapacityBottleneck;
  /** Which dimension limited maxConnections. */
  connectionsBottleneck: RelayCapacityBottleneck;
  ram: { reservations: number; connections: number };
  cpu: { reservations: number; connections: number };
}

export interface RelayCapacityProfile {
  tier: RelayCapacityTier;
  /**
   * Normalized bottleneck score: min(ram/refRam, cpu/refCpu).
   * 1.0 ≈ reference 2 vCPU / 4 GB host. Logging only — limits use breakdown min().
   */
  capacityScore: number;
  breakdown: RelayCapacityBreakdown;
  /** Formula minimum connection budget — adaptive never shrinks below this. */
  hardwareConnectionFloor: number;
  /** RAM/CPU breakdown max — adaptive + libp2p cap (not blind 8192). */
  hardwareConnectionCeiling: number;
  /** Formula minimum home slots (same as ceiling when hardware-bound). */
  hardwareReservationFloor: number;
  /** RAM/CPU breakdown max for reservations (= libp2p cap when auto). */
  hardwareReservationCeiling: number;
  /** libp2p connectionManager.maxConnections (= hardwareConnectionCeiling when auto). */
  libp2pConnectionCap: number;
  /** libp2p circuit-relay maxReservations (= hardwareReservationCeiling when auto). */
  libp2pReservationCap: number;
  maxRssMb: number;
  initialEffectiveMaxPeers: number;
  /** Starts at hardwareConnectionFloor. */
  initialAdaptiveConnectionBudget: number;
  /** Starts at hardwareReservationFloor. */
  initialAdaptiveReservationBudget: number;
  reason: string;
}

export interface RelayCapacityPublicSnapshot {
  autoCapacityEnabled: boolean;
  tier: RelayCapacityTier;
  capacityScore: number;
  breakdown: RelayCapacityBreakdown;
  hardware: RelayHostHardware;
  hardwareConnectionFloor: number;
  hardwareConnectionCeiling: number;
  hardwareReservationFloor: number;
  hardwareReservationCeiling: number;
  /** libp2p hard caps (= hardware ceilings when auto). */
  maxConnections: number;
  maxReservations: number;
  maxRssMb: number;
  effectiveMaxPeers: number;
  adaptiveConnectionBudget: number;
  adaptiveReservationBudget: number;
  explicitMaxConnections: boolean;
  explicitMaxReservations: boolean;
  explicitMaxRssMb: boolean;
}

export interface ApplyRelayAutoCapacityResult {
  profile: RelayCapacityProfile;
  snapshot: RelayCapacityPublicSnapshot;
  maxRssMb: number;
  /** Manual caps present in env/CLI that auto mode ignored (for startup log). */
  ignoredManualOverrides: string[];
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function bottleneckOf(ramLimit: number, cpuLimit: number): RelayCapacityBottleneck {
  const ratio = ramLimit / Math.max(1, cpuLimit);
  if (ratio < 0.9) return "ram";
  if (ratio > 1.1) return "cpu";
  return "balanced";
}

export function detectRelayHostHardware(
  opts?: { cpuCount?: number; ramBytes?: number },
): RelayHostHardware {
  const cpuCount = Math.max(1, opts?.cpuCount ?? cpus().length);
  const ramBytes = Math.max(512 * 1024 * 1024, opts?.ramBytes ?? totalmem());
  return {
    cpuCount,
    ramBytes,
    ramGb: Math.round((ramBytes / GB) * 10) / 10,
  };
}

export function isRelayAutoCapacityEnabled(
  env: NodeJS.ProcessEnv,
  args: Pick<RelayArgs, "relayPublicMode" | "maxConnections">,
): boolean {
  const raw = env.ENVOYMESH_RELAY_AUTO_CAPACITY?.trim().toLowerCase();
  if (raw === "0" || raw === "false" || raw === "no" || raw === "off") {
    return false;
  }
  if (raw === "1" || raw === "true" || raw === "yes" || raw === "on") {
    return true;
  }
  return args.relayPublicMode;
}

/**
 * Bottleneck-normalized score for logging. **Not** used to derive limits directly.
 * Reference host (2 vCPU / 4 GB) ≈ 1.0.
 */
export function computeCapacityScore(hw: RelayHostHardware, _publicMode = true): number {
  const ramGb = hw.ramBytes / GB;
  const ramNorm = ramGb / REFERENCE_RAM_GB;
  const cpuNorm = hw.cpuCount / REFERENCE_CPU_COUNT;
  return Math.min(ramNorm, cpuNorm);
}

function labelTier(capacityScore: number): RelayCapacityTier {
  if (capacityScore < 0.45) return "small";
  if (capacityScore < 1.05) return "medium";
  if (capacityScore < 2.0) return "large";
  return "xlarge";
}

function computeBreakdown(
  hw: RelayHostHardware,
  publicMode: boolean,
): RelayCapacityBreakdown {
  const ramGb = hw.ramBytes / GB;
  const cpu = hw.cpuCount;
  const c = publicMode ? CAPACITY_CONSTANTS_PUBLIC : CAPACITY_CONSTANTS_PRIVATE;

  const ramReservations = Math.floor(
    (ramGb * c.ramFractionForHomes * GB) / c.bytesPerHomeHop,
  );
  const cpuReservations = Math.floor(cpu * c.homesPerCpuCore);

  const ramConnections = Math.floor(ramGb * c.tcpConnsPerGbRam);
  const cpuConnections = Math.floor(cpu * c.tcpConnsPerCpuCore / c.cpuStressWeight);

  return {
    reservationsBottleneck: bottleneckOf(ramReservations, cpuReservations),
    connectionsBottleneck: bottleneckOf(ramConnections, cpuConnections),
    ram: { reservations: ramReservations, connections: ramConnections },
    cpu: { reservations: cpuReservations, connections: cpuConnections },
  };
}

/**
 * Formula-derived **hardware floor** (conservative min of RAM/CPU/home-need).
 * libp2p caps use hardware ceiling (RAM/CPU breakdown); runtime grows floor → ceiling.
 */
export function computeRelayCapacityFromHardware(
  hw: RelayHostHardware,
  publicMode: boolean,
): RelayCapacityProfile {
  const ramGb = hw.ramBytes / GB;
  const cpu = hw.cpuCount;
  const c = publicMode ? CAPACITY_CONSTANTS_PUBLIC : CAPACITY_CONSTANTS_PRIVATE;
  const breakdown = computeBreakdown(hw, publicMode);
  const capacityScore = computeCapacityScore(hw, publicMode);
  const tier = labelTier(capacityScore);

  const reservationCap = publicMode
    ? PUBLIC_MAX_RESERVATIONS_CAP
    : PRIVATE_MAX_RESERVATIONS_CAP;
  const connectionCap = PUBLIC_MAX_CONNECTIONS_CAP;

  const hardwareReservationFloor = clamp(
    Math.min(breakdown.ram.reservations, breakdown.cpu.reservations),
    publicMode ? 128 : 32,
    reservationCap,
  );

  const hardwareReservationCeiling = clamp(
    Math.min(
      reservationCap,
      breakdown.ram.reservations,
      breakdown.cpu.reservations,
    ),
    hardwareReservationFloor,
    reservationCap,
  );

  const swarmBudget = c.swarmConnBase + cpu * c.swarmConnPerCpu;
  const homeConnectionNeedFloor = Math.ceil(
    hardwareReservationFloor * c.tcpConnsPerHome,
  );
  const homeConnectionNeedCeiling = Math.ceil(
    hardwareReservationCeiling * c.tcpConnsPerHome,
  );

  const hardwareConnectionFloor = clamp(
    Math.min(
      homeConnectionNeedFloor + swarmBudget,
      breakdown.ram.connections,
      breakdown.cpu.connections,
    ),
    publicMode ? 256 : 64,
    connectionCap,
  );

  const hardwareConnectionCeiling = clamp(
    Math.min(
      homeConnectionNeedCeiling + swarmBudget,
      breakdown.ram.connections,
      breakdown.cpu.connections,
      connectionCap,
    ),
    hardwareConnectionFloor,
    connectionCap,
  );

  const libp2pConnectionCap = hardwareConnectionCeiling;
  const libp2pReservationCap = hardwareReservationCeiling;

  const maxRssMb = clamp(
    Math.floor(ramGb * 1024 * c.rssFraction),
    c.rssFloorMb,
    Math.min(12288, Math.floor(ramGb * 1024 * c.rssFractionMax)),
  );

  const initialAdaptiveConnectionBudget = hardwareConnectionFloor;
  const initialAdaptiveReservationBudget = hardwareReservationFloor;
  const initialEffectiveMaxPeers = Math.max(
    64,
    Math.floor(
      computeSwarmBudgetFromFloor(initialAdaptiveConnectionBudget, 0),
    ),
  );

  const reason =
    `bottleneck res=${breakdown.reservationsBottleneck} conn=${breakdown.connectionsBottleneck} ` +
    `score=${capacityScore.toFixed(2)} ` +
    `(floorRes=${hardwareReservationFloor} ceilRes=${hardwareReservationCeiling} ` +
    `floorConn=${hardwareConnectionFloor} ceilConn=${hardwareConnectionCeiling} rssMb=${maxRssMb}) ` +
    `${cpu}CPU ${hw.ramGb}GB`;

  return {
    tier,
    capacityScore,
    breakdown,
    hardwareConnectionFloor,
    hardwareConnectionCeiling,
    hardwareReservationFloor,
    hardwareReservationCeiling,
    libp2pConnectionCap,
    libp2pReservationCap,
    maxRssMb,
    initialEffectiveMaxPeers,
    initialAdaptiveConnectionBudget,
    initialAdaptiveReservationBudget,
    reason,
  };
}

/** Swarm peer headroom at a given connection budget with no active homes. */
function computeSwarmBudgetFromFloor(connectionBudget: number, reservationCount: number): number {
  const FLEET_HEADROOM = 48;
  const MIN_SWARM = 64;
  const raw = connectionBudget - Math.max(0, reservationCount) - FLEET_HEADROOM;
  return Math.max(MIN_SWARM, raw);
}

export function clampAdaptiveConnectionLimits(input: {
  hardwareConnectionFloor: number;
  hardwareConnectionCeiling: number;
  explicitMaxConnections: number | null;
}): {
  connectionFloor: number;
  connectionCeiling: number;
  libp2pConnectionCap: number;
  initialAdaptiveConnectionBudget: number;
} {
  if (input.explicitMaxConnections != null) {
    const cap = input.explicitMaxConnections;
    const floor = Math.min(input.hardwareConnectionFloor, cap);
    return {
      connectionFloor: floor,
      connectionCeiling: cap,
      libp2pConnectionCap: cap,
      initialAdaptiveConnectionBudget: floor,
    };
  }
  return {
    connectionFloor: input.hardwareConnectionFloor,
    connectionCeiling: input.hardwareConnectionCeiling,
    libp2pConnectionCap: input.hardwareConnectionCeiling,
    initialAdaptiveConnectionBudget: input.hardwareConnectionFloor,
  };
}

export function clampAdaptiveReservationLimits(input: {
  hardwareReservationFloor: number;
  hardwareReservationCeiling: number;
  explicitMaxReservations: number | null;
}): {
  reservationFloor: number;
  reservationCeiling: number;
  libp2pReservationCap: number;
  initialAdaptiveReservationBudget: number;
} {
  if (input.explicitMaxReservations != null) {
    const cap = input.explicitMaxReservations;
    const floor = Math.min(input.hardwareReservationFloor, cap);
    return {
      reservationFloor: floor,
      reservationCeiling: cap,
      libp2pReservationCap: cap,
      initialAdaptiveReservationBudget: floor,
    };
  }
  return {
    reservationFloor: input.hardwareReservationFloor,
    reservationCeiling: input.hardwareReservationCeiling,
    libp2pReservationCap: input.hardwareReservationCeiling,
    initialAdaptiveReservationBudget: input.hardwareReservationFloor,
  };
}

export function resolveRelayCapacityProfile(input: {
  hardware: RelayHostHardware;
  publicMode: boolean;
  autoCapacityEnabled: boolean;
}): RelayCapacityProfile {
  return computeRelayCapacityFromHardware(input.hardware, input.publicMode);
}

function readExplicitMaxRssMb(env: NodeJS.ProcessEnv): number | null {
  const raw = env.ENVOYMESH_RELAY_MAX_RSS_MB?.trim();
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.floor(n);
}

function collectIgnoredManualCapacityOverrides(input: {
  autoCapacityEnabled: boolean;
  args: RelayArgs;
  env: NodeJS.ProcessEnv;
}): string[] {
  if (!input.autoCapacityEnabled) {
    return [];
  }
  const ignored: string[] = [];
  if (input.args.maxConnections != null) {
    ignored.push(`maxConnections=${input.args.maxConnections}`);
  }
  if (input.args.relayMaxReservations != null) {
    ignored.push(`maxReservations=${input.args.relayMaxReservations}`);
  }
  if (input.args.relayMaxOutboundStopStreams != null) {
    ignored.push(`maxOutboundStopStreams=${input.args.relayMaxOutboundStopStreams}`);
  }
  if (readExplicitMaxRssMb(input.env) != null) {
    ignored.push(`ENVOYMESH_RELAY_MAX_RSS_MB=${input.env.ENVOYMESH_RELAY_MAX_RSS_MB}`);
  }
  if (input.env.ENVOYMESH_RELAY_MAX_CONNECTIONS?.trim()) {
    ignored.push(`ENVOYMESH_RELAY_MAX_CONNECTIONS=${input.env.ENVOYMESH_RELAY_MAX_CONNECTIONS}`);
  }
  if (input.env.ENVOYMESH_RELAY_MAX_RESERVATIONS?.trim()) {
    ignored.push(`ENVOYMESH_RELAY_MAX_RESERVATIONS=${input.env.ENVOYMESH_RELAY_MAX_RESERVATIONS}`);
  }
  return ignored;
}

export function applyRelayAutoCapacity(input: {
  args: RelayArgs;
  env: NodeJS.ProcessEnv;
  hardware?: RelayHostHardware;
}): ApplyRelayAutoCapacityResult {
  const hardware = input.hardware ?? detectRelayHostHardware();
  const autoCapacityEnabled = isRelayAutoCapacityEnabled(input.env, input.args);
  const ignoredManualOverrides = collectIgnoredManualCapacityOverrides({
    autoCapacityEnabled,
    args: input.args,
    env: input.env,
  });
  const hadManualMaxConnections = input.args.maxConnections != null;
  const hadManualMaxReservations = input.args.relayMaxReservations != null;
  const hadManualMaxRssMb = readExplicitMaxRssMb(input.env) != null;

  const profile = resolveRelayCapacityProfile({
    hardware,
    publicMode: input.args.relayPublicMode,
    autoCapacityEnabled,
  });

  const explicitConnCap =
    autoCapacityEnabled ? null : (hadManualMaxConnections ? input.args.maxConnections : null);
  const connLimits = clampAdaptiveConnectionLimits({
    hardwareConnectionFloor: profile.hardwareConnectionFloor,
    hardwareConnectionCeiling: profile.hardwareConnectionCeiling,
    explicitMaxConnections: explicitConnCap ?? null,
  });

  const explicitResCap =
    autoCapacityEnabled ? null : (hadManualMaxReservations ? input.args.relayMaxReservations : null);
  const resLimits = clampAdaptiveReservationLimits({
    hardwareReservationFloor: profile.hardwareReservationFloor,
    hardwareReservationCeiling: profile.hardwareReservationCeiling,
    explicitMaxReservations: explicitResCap ?? null,
  });

  let maxConnections = input.args.maxConnections ?? connLimits.libp2pConnectionCap;
  let maxReservations =
    input.args.relayMaxReservations ??
    (autoCapacityEnabled ? resLimits.libp2pReservationCap : null);

  if (autoCapacityEnabled) {
    input.args.maxConnections = connLimits.libp2pConnectionCap;
    maxConnections = connLimits.libp2pConnectionCap;
    input.args.relayMaxReservations = resLimits.libp2pReservationCap;
    maxReservations = resLimits.libp2pReservationCap;
    if (input.args.relayPublicMode) {
      input.args.relayMaxOutboundStopStreams = maxReservations;
    }
  } else if (!hadManualMaxConnections) {
    input.args.maxConnections = connLimits.libp2pConnectionCap;
    maxConnections = connLimits.libp2pConnectionCap;
  } else if (!hadManualMaxReservations && maxReservations != null) {
    input.args.relayMaxReservations = resLimits.libp2pReservationCap;
    maxReservations = resLimits.libp2pReservationCap;
    if (input.args.relayMaxOutboundStopStreams == null && input.args.relayPublicMode) {
      input.args.relayMaxOutboundStopStreams = maxReservations;
    }
  }

  const maxRssMb = autoCapacityEnabled
    ? profile.maxRssMb
    : (readExplicitMaxRssMb(input.env) ?? 3072);

  const effectiveConnFloor = autoCapacityEnabled
    ? connLimits.connectionFloor
    : profile.hardwareConnectionFloor;
  const effectiveConnCeiling = autoCapacityEnabled
    ? connLimits.connectionCeiling
    : maxConnections;
  const effectiveResFloor = autoCapacityEnabled
    ? resLimits.reservationFloor
    : profile.hardwareReservationFloor;
  const effectiveResCeiling = autoCapacityEnabled
    ? resLimits.reservationCeiling
    : (maxReservations ?? profile.hardwareReservationCeiling);
  const initialAdaptive = autoCapacityEnabled
    ? connLimits.initialAdaptiveConnectionBudget
    : profile.initialAdaptiveConnectionBudget;
  const initialAdaptiveRes = autoCapacityEnabled
    ? resLimits.initialAdaptiveReservationBudget
    : profile.initialAdaptiveReservationBudget;
  const initialPeers = autoCapacityEnabled
    ? Math.max(64, Math.floor(computeSwarmBudgetFromFloor(initialAdaptive, 0) * 0.92))
    : profile.initialEffectiveMaxPeers;

  const snapshot: RelayCapacityPublicSnapshot = {
    autoCapacityEnabled,
    tier: profile.tier,
    capacityScore: profile.capacityScore,
    breakdown: profile.breakdown,
    hardware,
    hardwareConnectionFloor: effectiveConnFloor,
    hardwareConnectionCeiling: effectiveConnCeiling,
    hardwareReservationFloor: effectiveResFloor,
    hardwareReservationCeiling: effectiveResCeiling,
    maxConnections,
    maxReservations: maxReservations ?? (input.args.relayPublicMode ? 1024 : 15),
    maxRssMb,
    effectiveMaxPeers: initialPeers,
    adaptiveConnectionBudget: initialAdaptive,
    adaptiveReservationBudget: initialAdaptiveRes,
    explicitMaxConnections: autoCapacityEnabled ? false : hadManualMaxConnections,
    explicitMaxReservations: autoCapacityEnabled ? false : hadManualMaxReservations,
    explicitMaxRssMb: autoCapacityEnabled ? false : hadManualMaxRssMb,
  };

  return {
    profile: {
      ...profile,
      initialAdaptiveConnectionBudget: initialAdaptive,
      initialAdaptiveReservationBudget: initialAdaptiveRes,
      initialEffectiveMaxPeers: initialPeers,
    },
    snapshot,
    maxRssMb,
    ignoredManualOverrides,
  };
}

export function formatRelayCapacityIgnoredOverridesLog(
  ignored: string[],
): string | null {
  if (ignored.length === 0) {
    return null;
  }
  const unique = [...new Set(ignored)];
  return (
    `[relay-capacity] auto ignored manual caps: ${unique.join(", ")} ` +
    `(remove from systemd or set ENVOYMESH_RELAY_AUTO_CAPACITY=0 to use them)`
  );
}

export function formatRelayCapacityStartupLog(
  snapshot: RelayCapacityPublicSnapshot,
): string | null {
  if (!snapshot.autoCapacityEnabled) {
    return null;
  }
  const b = snapshot.breakdown;
  const parts = [
    `score=${snapshot.capacityScore.toFixed(2)}`,
    `tier=${snapshot.tier}`,
    `resBn=${b.reservationsBottleneck}`,
    `connBn=${b.connectionsBottleneck}`,
    `floorConn=${snapshot.hardwareConnectionFloor}`,
    `ceilConn=${snapshot.hardwareConnectionCeiling}`,
    `floorRes=${snapshot.hardwareReservationFloor}`,
    `ceilRes=${snapshot.hardwareReservationCeiling}`,
    `libp2pConn=${snapshot.maxConnections}`,
    `libp2pRes=${snapshot.maxReservations}`,
    `adaptiveBudget=${snapshot.adaptiveConnectionBudget}`,
    `adaptiveRes=${snapshot.adaptiveReservationBudget}`,
    `maxRssMb=${snapshot.maxRssMb}`,
    `ram(res=${b.ram.reservations},conn=${b.ram.connections})`,
    `cpu(res=${b.cpu.reservations},conn=${b.cpu.connections})`,
    `${snapshot.hardware.cpuCount}CPU/${snapshot.hardware.ramGb}GB`,
  ];
  if (snapshot.explicitMaxConnections) {
    parts.push("maxConnections=explicit");
  }
  if (snapshot.explicitMaxReservations) {
    parts.push("maxReservations=explicit");
  }
  return `[relay-capacity] auto (max-homes): ${parts.join(" ")} (disable: ENVOYMESH_RELAY_AUTO_CAPACITY=0)`;
}
