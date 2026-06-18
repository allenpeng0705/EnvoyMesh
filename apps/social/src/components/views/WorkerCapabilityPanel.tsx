/**
 * Phase 42E — Worker Capability Panel.
 *
 * Shows bonded contacts who may act as chain workers (direct / referred trust).
 * Displays their trust level, agent card summary, and peer reputation if available.
 *
 * Note: Full capability tags require the `capabilityIndex` RPC (Phase 41B
 * follow-on). The panel currently surfaces bonded contacts with trust-level
 * eligibility and available reputation data.
 *
 * Rendered in the Social UI under Settings → Network → Workers.
 */

import React, { useEffect, useState, useCallback } from "react";
import { useNodeService } from "../../hooks/useNodeService.js";
import { useT } from "../../context/I18nContext.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WorkerInfo {
  peerOwnerId: string;
  displayName: string;
  bondLevel: "direct" | "referred";
  reputation: number | null; // null when getPeerReputationSummary is unavailable
  lastSeenAt: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function WorkerCapabilityPanel() {
  const t = useT();
  const nodeService = useNodeService();
  const [workers, setWorkers] = useState<WorkerInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [levelFilter, setLevelFilter] = useState<"all" | "direct" | "referred">("all");

  const loadWorkers = useCallback(async () => {
    setLoading(true);
    try {
      const bonds = await nodeService.getBonds();

      // Only include direct / referred bonds — public contacts can't be workers
      const eligible = bonds.filter(
        (b: { level?: string }) => b.level === "direct" || b.level === "referred",
      );

      // Fetch reputation for each eligible bond (best-effort — don't fail the whole load)
      const repData = await Promise.allSettled(
        eligible.map((b: { peerOwnerId?: string }) =>
          nodeService.getPeerReputationSummary(b.peerOwnerId ?? "").catch(() => null),
        ),
      );

      const workerList: WorkerInfo[] = eligible.map(
        (b: {
          peerOwnerId?: string;
          displayName?: string;
          level?: string;
          lastSeenAt?: string;
          updatedAt?: string;
        }, i: number) => {
          const rep = repData[i];
          // Compute a 0–100 score from the reputation summary
          let reputation: number | null = null;
          if (rep?.status === "fulfilled" && rep.value) {
            const summary = rep.value;
            const local = summary.local;
            if (local) {
              const total = local.successfulTasks + local.failedTasks;
              reputation =
                total > 0
                  ? Math.round((local.successfulTasks / total) * 100)
                  : null;
            }
          }

          return {
            peerOwnerId: b.peerOwnerId ?? "",
            displayName:
              b.displayName ?? (b.peerOwnerId?.slice(0, 12) ?? "?"),
            bondLevel: (b.level ?? "referred") as "direct" | "referred",
            reputation,
            lastSeenAt: b.lastSeenAt ?? b.updatedAt ?? "",
          };
        },
      );

      setWorkers(workerList);
    } catch (err) {
      console.error("[WorkerCapabilityPanel] failed to load workers:", err);
    } finally {
      setLoading(false);
    }
  }, [nodeService]);

  useEffect(() => {
    void loadWorkers();
  }, [loadWorkers]);

  // Filter workers
  const filtered = workers.filter((w) => {
    if (
      searchQuery &&
      !w.displayName.toLowerCase().includes(searchQuery.toLowerCase())
    ) {
      return false;
    }
    if (levelFilter !== "all" && w.bondLevel !== levelFilter) return false;
    return true;
  });

  // Unique bond levels for the filter
  const bondLevels: Array<"all" | "direct" | "referred"> = [
    "all",
    "direct",
    "referred",
  ];

  return (
    <div className="worker-capability-panel">
      <h3>{t("workerCapability.title")}</h3>
      <p className="worker-description">
        {t("workerCapability.description")}
      </p>

      {/* Filters */}
      <div className="worker-filters">
        <input
          type="text"
          className="worker-search"
          placeholder={t("workerCapability.searchPlaceholder")}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        <select
          className="worker-bond-select"
          value={levelFilter}
          onChange={(e) =>
            setLevelFilter(e.target.value as "all" | "direct" | "referred")
          }
        >
          {bondLevels.map((lvl) => (
            <option key={lvl} value={lvl}>
              {t(`workerCapability.level.${lvl}`)}
            </option>
          ))}
        </select>
      </div>

      {/* Worker list */}
      {loading ? (
        <p className="worker-loading">{t("workerCapability.loading")}</p>
      ) : filtered.length === 0 ? (
        <p className="worker-empty">
          {workers.length === 0
            ? t("workerCapability.empty.noWorkers")
            : t("workerCapability.empty.filtered")}
        </p>
      ) : (
        <div className="worker-list">
          {filtered.map((w) => (
            <div key={w.peerOwnerId} className="worker-card">
              <div className="worker-card-header">
                <strong className="worker-name">{w.displayName}</strong>
                <span
                  className={`worker-bond-level bond-${w.bondLevel}`}
                >
                  {t(`workerCapability.level.${w.bondLevel}`)}
                </span>
              </div>

              <div className="worker-meta">
                {w.reputation !== null ? (
                  <span
                    className="worker-reputation"
                    title={t("workerCapability.reputationTooltip", {
                      score: w.reputation,
                    })}
                  >
                    {"★".repeat(Math.round((w.reputation ?? 0) / 20))}
                    {"☆".repeat(5 - Math.round((w.reputation ?? 0) / 20))}
                    {" "}
                    {w.reputation}
                    /100
                  </span>
                ) : (
                  <span className="worker-reputation worker-reputation--na">
                    {t("workerCapability.reputationNA")}
                  </span>
                )}
                {w.lastSeenAt && (
                  <span className="worker-last-seen">
                    {t("workerCapability.lastSeen", {
                      date: new Date(w.lastSeenAt).toLocaleDateString(),
                    })}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
