/**
 * Digest Generator for AI Agent
 *
 * Generates periodic summaries of agent activities:
 * - Daily/weekly digest of all actions
 * - Aggregates audit events into human-readable format
 * - Surfaces pending items requiring attention
 */

import { randomUUID } from "node:crypto";
import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

function isoWeekMondayKey(d: Date): string {
  const tmp = new Date(d);
  tmp.setHours(0, 0, 0, 0);
  const day = (tmp.getDay() + 6) % 7; // Mon=0
  tmp.setDate(tmp.getDate() - day);
  return tmp.toISOString().slice(0, 10);
}

/**
 * Digest frequency.
 */
export type DigestFrequency = "daily" | "weekly" | "off";

/**
 * Digest configuration.
 */
export interface DigestConfig {
  frequency: DigestFrequency;
  outputDir: string;
  includeExternalAgentCalls: boolean;
  includeDiscoveryQueries: boolean;
  includeBondChanges: boolean;
  includeProactiveActions: boolean;
  includePendingItems: boolean;
  includeStyleAdaptations: boolean;
  nextScheduledAt?: string;
}

/**
 * Action summary entry.
 */
export interface ActionSummaryEntry {
  type: string;
  count: number;
  examples: string[];
}

/**
 * Contact activity entry.
 */
export interface ContactActivityEntry {
  contactOwnerId: string;
  contactDisplayName: string;
  messageCount: number;
  lastInteractionAt: string;
  escalated: boolean;
  pendingApproval: boolean;
}

/**
 * External agent activity entry.
 */
export interface ExternalAgentActivityEntry {
  agentId: string;
  agentName: string;
  actionCount: number;
  lastActivityAt: string;
  actions: string[];
}

/**
 * Proactive action entry.
 */
export interface ProactiveActionEntry {
  triggerName: string;
  triggerType: string;
  firedAt: string;
  actionTaken: string;
  success: boolean;
}

/**
 * Pending item entry.
 */
export interface PendingItemEntry {
  id: string;
  type: string;
  title: string;
  priority: "low" | "normal" | "high" | "urgent";
  requestedAt: string;
}

/**
 * Digest summary.
 */
export interface DigestSummary {
  id: string;
  period: "daily" | "weekly";
  startDate: string;
  endDate: string;
  generatedAt: string;

  // Activity counts
  totalActions: number;
  actionsByType: ActionSummaryEntry[];

  // Contact activity
  contactsInteracted: ContactActivityEntry[];
  newBonds: number;
  bondsRevoked: number;

  // External agents
  externalAgentActivity: ExternalAgentActivityEntry[];

  // Proactive actions
  proactiveActionsTriggered: ProactiveActionEntry[];

  // Pending items
  pendingApprovals: PendingItemEntry[];
  pendingEscalations: PendingItemEntry[];

  // Mode transitions
  modeTransitions: { from: string; to: string; reason: string; count: number }[];

  // Style adaptations
  styleAdaptationsApplied: number;

  /** A2A / agent Activity rows since period start (Phase 13D). */
  a2aActivityCount: number;

  /** Friend autopilot passes in period (Phase 14A). */
  friendAutopilotPassCount: number;

  /** Dormant bonds detected (Phase 23C). */
  dormantBonds: Array<{ peerOwnerId: string; displayName?: string; dormantDays: number }>;

  /** Proactive mesh insights (Phase 25A). */
  meshInsights: Array<{ kind: string; summary: string; matchedTopic: string }>;

  /** Agent-proposed circles (Phase 23A). */
  proposedCircles: Array<{ label: string; memberCount: number; reason?: string }>;

  // Summary text
  summaryText: string;
}

/**
 * Create default digest config.
 */
export function createDefaultDigestConfig(outputDir: string): DigestConfig {
  return {
    frequency: "daily",
    outputDir,
    includeExternalAgentCalls: true,
    includeDiscoveryQueries: true,
    includeBondChanges: true,
    includeProactiveActions: true,
    includePendingItems: true,
    includeStyleAdaptations: true,
  };
}

/**
 * Calculate digest period dates.
 */
export function getDigestPeriodDates(period: "daily" | "weekly"): { start: Date; end: Date } {
  const now = new Date();
  const end = new Date(now);

  if (period === "daily") {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    return { start, end };
  } else {
    // Weekly - last 7 days
    const start = new Date(now);
    start.setDate(start.getDate() - 7);
    start.setHours(0, 0, 0, 0);
    return { start, end };
  }
}

/**
 * Generate a summary text from digest data.
 */
export function generateSummaryText(digest: DigestSummary): string {
  const lines: string[] = [];

  lines.push(`## ${digest.period === "daily" ? "Daily" : "Weekly"} Digest`);
  lines.push(`**${new Date(digest.startDate).toLocaleDateString()} - ${new Date(digest.endDate).toLocaleDateString()}**`);
  lines.push("");

  // Overview
  lines.push("### Overview");
  lines.push(`- Total actions: ${digest.totalActions}`);
  lines.push(`- Contacts interacted: ${digest.contactsInteracted.length}`);
  if (digest.newBonds > 0) lines.push(`- New bonds established: ${digest.newBonds}`);
  if (digest.bondsRevoked > 0) lines.push(`- Bonds revoked: ${digest.bondsRevoked}`);
  if (digest.a2aActivityCount > 0) {
    lines.push(`- Agent activity (A2A): ${digest.a2aActivityCount} events`);
  }
  if (digest.friendAutopilotPassCount > 0) {
    lines.push(
      `- Autonomy passes (friend finding / social proxy): ${digest.friendAutopilotPassCount}`,
    );
  }
  lines.push("");

  // Pending items
  if (digest.pendingApprovals.length > 0) {
    lines.push("### Pending Approvals");
    for (const item of digest.pendingApprovals) {
      lines.push(`- [${item.priority.toUpperCase()}] ${item.title}`);
    }
    lines.push("");
  }

  // Escalations
  if (digest.pendingEscalations.length > 0) {
    lines.push("### Active Escalations");
    for (const item of digest.pendingEscalations) {
      lines.push(`- [${item.priority.toUpperCase()}] ${item.title}`);
    }
    lines.push("");
  }

  // Proactive actions
  if (digest.proactiveActionsTriggered.length > 0) {
    lines.push("### Proactive Actions");
    lines.push(`${digest.proactiveActionsTriggered.length} triggered`);
    lines.push("");
  }

  // External agents
  if (digest.externalAgentActivity.length > 0) {
    lines.push("### External Agents");
    for (const agent of digest.externalAgentActivity) {
      lines.push(`- ${agent.agentName}: ${agent.actionCount} actions`);
    }
    lines.push("");
  }

  // Phase 23C — Dormant bonds
  const dormantBonds = digest.dormantBonds ?? [];
  if (dormantBonds.length > 0) {
    lines.push("### Dormant Bonds");
    for (const db of dormantBonds) {
      lines.push(`- ${db.displayName ?? db.peerOwnerId}: ${db.dormantDays} days since last interaction`);
    }
    lines.push("");
  }

  // Phase 25A — Mesh insights
  const meshInsights = digest.meshInsights ?? [];
  if (meshInsights.length > 0) {
    lines.push("### Mesh Activity");
    for (const mi of meshInsights) {
      lines.push(`- ${mi.summary}`);
    }
    lines.push("");
  }

  // Phase 23A — Proposed circles
  const proposedCircles = digest.proposedCircles ?? [];
  if (proposedCircles.length > 0) {
    lines.push("### Proposed Circles");
    for (const pc of proposedCircles) {
      const note = pc.reason ? ` (${pc.reason})` : "";
      lines.push(`- ${pc.label}: ${pc.memberCount} members${note}`);
    }
    lines.push("");
  }

  // Mode transitions
  if (digest.modeTransitions.length > 0) {
    lines.push("### Mode Changes");
    for (const t of digest.modeTransitions) {
      lines.push(`- ${t.from} → ${t.to} (${t.reason}): ${t.count} times`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Digest Generator aggregates audit events into digests.
 */
export class DigestGenerator {
  private config: DigestConfig;
  /** Last successful scheduled/manual generation (Phase 69B — due checks). */
  private lastGeneratedAtMs: number | null = null;

  constructor(config: DigestConfig) {
    this.config = config;
  }

  /** Record that a digest was produced (scheduler must call after save). */
  markDigestGenerated(at: Date = new Date()): void {
    this.lastGeneratedAtMs = at.getTime();
  }

  /**
   * Hydrate `lastGeneratedAtMs` from the newest on-disk digest so restarts
   * after 09:00 do not immediately re-fire the same day/week slot.
   */
  async hydrateLastGeneratedFromDisk(): Promise<void> {
    try {
      const names = await readdir(this.config.outputDir);
      let newestMs = 0;
      for (const name of names) {
        if (!name.endsWith(".json")) continue;
        try {
          const raw = await readFile(join(this.config.outputDir, name), "utf8");
          const parsed = JSON.parse(raw) as { generatedAt?: string };
          const ms = parsed.generatedAt ? Date.parse(parsed.generatedAt) : Number.NaN;
          if (Number.isFinite(ms) && ms > newestMs) newestMs = ms;
        } catch {
          /* skip corrupt/partial files */
        }
      }
      if (newestMs > 0) {
        this.lastGeneratedAtMs = newestMs;
      }
    } catch {
      /* missing dir is fine — first run */
    }
  }

  /**
   * Whether a scheduled digest should run now.
   * Daily: at/after local 09:00, at most once per calendar day.
   * Weekly: at/after Monday 09:00, at most once per ISO week (Mon–Sun).
   */
  isDigestDue(now: Date = new Date()): boolean {
    if (this.config.frequency === "off") return false;
    if (now.getHours() < 9) return false;

    if (this.lastGeneratedAtMs == null) return true;
    const last = new Date(this.lastGeneratedAtMs);

    if (this.config.frequency === "daily") {
      return last.toDateString() !== now.toDateString();
    }

    return isoWeekMondayKey(last) !== isoWeekMondayKey(now);
  }

  /**
   * Update digest configuration.
   */
  updateConfig(updates: Partial<DigestConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  /**
   * Get current configuration.
   */
  getConfig(): DigestConfig {
    return { ...this.config };
  }

  /**
   * Generate a digest from provided data.
   */
  async generateDigest(
    period: "daily" | "weekly",
    data: {
      actionCounts?: Record<string, number>;
      actionExamples?: Record<string, string[]>;
      contactActivity?: ContactActivityEntry[];
      newBonds?: number;
      bondsRevoked?: number;
      externalAgentActivity?: ExternalAgentActivityEntry[];
      proactiveActions?: ProactiveActionEntry[];
      pendingApprovals?: PendingItemEntry[];
      pendingEscalations?: PendingItemEntry[];
      modeTransitions?: { from: string; to: string; reason: string; count: number }[];
      styleAdaptationsApplied?: number;
      a2aActivityCount?: number;
      friendAutopilotPassCount?: number;
      // Phase 23C — Dormant bonds
      dormantBonds?: Array<{ peerOwnerId: string; displayName?: string; dormantDays: number }>;
      // Phase 25A — Mesh awareness insights
      meshInsights?: Array<{ kind: string; summary: string; matchedTopic: string }>;
      // Phase 23A — Proposed circles
      proposedCircles?: Array<{ label: string; memberCount: number; reason?: string }>;
    },
  ): Promise<DigestSummary> {
    const { start, end } = getDigestPeriodDates(period);

    // Build action summaries
    const actionsByType: ActionSummaryEntry[] = [];
    if (data.actionCounts) {
      for (const [type, count] of Object.entries(data.actionCounts)) {
        actionsByType.push({
          type,
          count,
          examples: data.actionExamples?.[type]?.slice(0, 3) || [],
        });
      }
    }

    const totalActions = actionsByType.reduce((sum, a) => sum + a.count, 0);

    const digest: DigestSummary = {
      id: randomUUID(),
      period,
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      generatedAt: new Date().toISOString(),
      totalActions,
      actionsByType,
      contactsInteracted: data.contactActivity || [],
      newBonds: data.newBonds || 0,
      bondsRevoked: data.bondsRevoked || 0,
      externalAgentActivity: data.externalAgentActivity || [],
      proactiveActionsTriggered: data.proactiveActions || [],
      pendingApprovals: data.pendingApprovals || [],
      pendingEscalations: data.pendingEscalations || [],
      modeTransitions: data.modeTransitions || [],
      styleAdaptationsApplied: data.styleAdaptationsApplied || 0,
      a2aActivityCount: data.a2aActivityCount ?? 0,
      friendAutopilotPassCount: data.friendAutopilotPassCount ?? 0,
      dormantBonds: data.dormantBonds || [],
      meshInsights: data.meshInsights || [],
      proposedCircles: data.proposedCircles || [],
      summaryText: "",
    };

    digest.summaryText = generateSummaryText(digest);
    return digest;
  }

  /**
   * Save digest to file.
   */
  async saveDigest(digest: DigestSummary): Promise<string> {
    await mkdir(this.config.outputDir, { recursive: true });

    const date = new Date(digest.startDate).toISOString().split("T")[0];
    const filename = `${digest.period}_${date}.json`;
    const filepath = join(this.config.outputDir, filename);

    await writeFile(filepath, JSON.stringify(digest, null, 2), "utf8");
    return filepath;
  }

  /**
   * Get the next scheduled digest time.
   */
  getNextScheduledTime(now: Date = new Date()): Date | null {
    if (this.config.frequency === "off") return null;

    const next = new Date(now);
    next.setHours(9, 0, 0, 0);
    next.setMinutes(0, 0, 0);

    if (this.config.frequency === "daily") {
      // Today 9am if still upcoming and not yet generated today; else tomorrow 9am.
      const alreadyToday =
        this.lastGeneratedAtMs != null &&
        new Date(this.lastGeneratedAtMs).toDateString() === now.toDateString();
      if (now < next && !alreadyToday) return next;
      next.setDate(next.getDate() + 1);
      return next;
    }

    // Weekly — this week's Monday 9am while the slot is still open; else next Monday.
    const monday = new Date(now);
    monday.setHours(9, 0, 0, 0);
    monday.setMinutes(0, 0, 0);
    const dow = (monday.getDay() + 6) % 7; // Mon=0
    monday.setDate(monday.getDate() - dow);
    const alreadyThisWeek =
      this.lastGeneratedAtMs != null &&
      isoWeekMondayKey(new Date(this.lastGeneratedAtMs)) === isoWeekMondayKey(now);
    if (!alreadyThisWeek) return monday;
    monday.setDate(monday.getDate() + 7);
    return monday;
  }
}

/**
 * Build the mesh.get-digest tool.
 */
export function buildGetDigestTool(
  generator: DigestGenerator,
): (params: Record<string, unknown>) => Promise<{
  ok: boolean;
  digest?: DigestSummary;
  period?: string;
  error?: string;
}> {
  return async (params) => {
    const period = (params.period as "daily" | "weekly") || "daily";

    if (period !== "daily" && period !== "weekly") {
      return { ok: false, error: "Period must be 'daily' or 'weekly'" };
    }

    // In a real implementation, this would pull data from audit logs, session manager, etc.
    // For now, generate an empty digest with placeholder structure
    const digest = await generator.generateDigest(period, {});

    return { ok: true, digest, period };
  };
}

/**
 * Build the mesh.set-digest-schedule tool.
 */
export function buildSetDigestScheduleTool(
  generator: DigestGenerator,
): (params: Record<string, unknown>) => Promise<{
  ok: boolean;
  config?: DigestConfig;
  error?: string;
}> {
  return async (params) => {
    const frequency = params.frequency as DigestFrequency | undefined;
    const outputDir = params.outputDir as string | undefined;

    if (frequency && !["daily", "weekly", "off"].includes(frequency)) {
      return { ok: false, error: "Frequency must be 'daily', 'weekly', or 'off'" };
    }

    generator.updateConfig({
      ...(frequency && { frequency }),
      ...(outputDir && { outputDir }),
    });

    return { ok: true, config: generator.getConfig() };
  };
}

/**
 * Build the mesh.get-digest-config tool.
 */
export function buildGetDigestConfigTool(
  generator: DigestGenerator,
): (params: Record<string, unknown>) => Promise<{
  ok: boolean;
  config: DigestConfig;
  nextScheduledAt?: string;
}> {
  return async () => {
    const config = generator.getConfig();
    const nextScheduled = generator.getNextScheduledTime();

    return {
      ok: true,
      config,
      nextScheduledAt: nextScheduled?.toISOString(),
    };
  };
}
