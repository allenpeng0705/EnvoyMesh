/**
 * Digest Generator for AI Agent
 *
 * Generates periodic summaries of agent activities:
 * - Daily/weekly digest of all actions
 * - Aggregates audit events into human-readable format
 * - Surfaces pending items requiring attention
 */

import { randomUUID } from "node:crypto";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

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

  constructor(config: DigestConfig) {
    this.config = config;
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
  getNextScheduledTime(): Date | null {
    if (this.config.frequency === "off") return null;

    const now = new Date();
    const next = new Date(now);

    if (this.config.frequency === "daily") {
      // Next day at 9am
      next.setDate(next.getDate() + 1);
      next.setHours(9, 0, 0, 0);
    } else {
      // Weekly - next Monday at 9am
      const daysUntilMonday = (8 - next.getDay()) % 7 || 7;
      next.setDate(next.getDate() + daysUntilMonday);
      next.setHours(9, 0, 0, 0);
    }

    return next;
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
