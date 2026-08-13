import { useCallback, useEffect, useMemo, useState } from "react";
import { useT } from "../../context/I18nContext.js";
import { useNodeService } from "../../hooks/useNodeService.js";
import { contactLabel } from "../../lib/display.js";
import type {
  AgentActivityRecord,
  AgentActivityDomain,
  Artifact,
  AuditEventSummary,
  BondRecord,
  TaskJournalSummary,
  TaskResultPayload,
} from "@envoymesh/api";
import { ArtifactList } from "../ArtifactRenderer.js";

type DateRangePreset = "all" | "today" | "7d" | "custom";

function fmtWhen(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function startOfLocalDay(date = new Date()): string {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function startOfNextLocalDay(date = new Date()): string {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 1);
  return d.toISOString();
}

function resolveDateRange(
  preset: DateRangePreset,
  customDay: string,
): { since?: string; until?: string } {
  if (preset === "all") return {};
  if (preset === "today") {
    return { since: startOfLocalDay(), until: startOfNextLocalDay() };
  }
  if (preset === "7d") {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return { since: d.toISOString() };
  }
  if (preset === "custom" && customDay.trim()) {
    const day = new Date(`${customDay.trim()}T00:00:00`);
    if (Number.isNaN(day.getTime())) return {};
    const next = new Date(day);
    next.setDate(next.getDate() + 1);
    return { since: day.toISOString(), until: next.toISOString() };
  }
  return {};
}

const ACTIVITY_DOMAINS: AgentActivityDomain[] = ["social", "knowledge", "home", "research"];

function ActivityDetailPanel(props: {
  row: AgentActivityRecord;
  onClose: () => void;
}) {
  const t = useT();
  const nodeService = useNodeService();
  const [audits, setAudits] = useState<AuditEventSummary[]>([]);
  const [journal, setJournal] = useState<TaskJournalSummary[]>([]);
  const [artifacts, setArtifacts] = useState<Artifact[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setArtifacts(null);
      const taskId = props.row.taskId;
      // Phase 34 review fix: use allSettled so a single failing branch
      // (e.g. transient `getTaskResult` network blip) does NOT wipe the
      // audit + journal lists the user was already looking at. Each branch
      // is independent: a failure logs and degrades silently to its empty
      // state.
      const [auditResult, journalResult, taskResultResult] = await Promise.allSettled([
        nodeService.listAuditEvents({
          correlationId: props.row.correlationId,
          taskId,
          limit: 50,
        }),
        nodeService.listTaskJournalEntries({
          taskId,
          limit: 50,
        }),
        // Phase 34: lazy-fetch the full task.result so the drill-down can
        // render typed Artifacts below the audit/journal lists. Returns
        // `undefined` for tasks that never received a result; we stay silent
        // in that case.
        taskId ? nodeService.getTaskResult(taskId) : Promise.resolve(undefined),
      ]);
      if (cancelled) return;
      if (auditResult.status === "fulfilled") {
        setAudits(auditResult.value);
      } else {
        console.warn("[ActivityView] listAuditEvents failed:", auditResult.reason);
        setAudits([]);
      }
      if (journalResult.status === "fulfilled") {
        setJournal(journalResult.value);
      } else {
        console.warn("[ActivityView] listTaskJournalEntries failed:", journalResult.reason);
        setJournal([]);
      }
      if (taskResultResult.status === "fulfilled") {
        const list = taskResultResult.value
          ? extractArtifacts(taskResultResult.value)
          : [];
        setArtifacts(list.length > 0 ? list : null);
      } else {
        // Don't surface to the user — drill-down stays silent when the
        // artifact fetch fails (e.g. mobile is offline). The audit list
        // is still rendered.
        console.warn("[ActivityView] getTaskResult failed:", taskResultResult.reason);
        setArtifacts(null);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [nodeService, props.row.activityId, props.row.correlationId, props.row.taskId]);

  return (
    <div className="activity-detail-panel">
      <div className="activity-detail-header">
        <h3>{t("activity.detailTitle")}</h3>
        <button type="button" className="btn-secondary" onClick={props.onClose}>
          {t("activity.close")}
        </button>
      </div>
      <p className="field-desc">{props.row.summary}</p>
      {props.row.kind === "commerce_receipt" && props.row.evidence && props.row.evidence.length > 0 && (
        <dl className="settings-list" style={{ marginBottom: "12px" }}>
          {props.row.evidence.map((item) => (
            <div key={`${item.type}-${item.ref}`} className="profile-info-row">
              <dt>{item.type}</dt>
              <dd>
                <code className="peer-id-display">{item.ref}</code>
              </dd>
            </div>
          ))}
        </dl>
      )}
      {loading ? (
        <p className="field-desc">{t("activity.loadingTrace")}</p>
      ) : (
        <>
          {journal.length > 0 && (
            <>
              <h4 className="activity-detail-subtitle">{t("activity.taskJournal")}</h4>
              <ul className="activity-trace-list">
                {journal.map((entry) => (
                  <li key={entry.eventId}>
                    <span className="activity-trace-kind">{entry.eventType}</span>
                    <span>{entry.summary}</span>
                    <time dateTime={entry.createdAt}>{fmtWhen(entry.createdAt)}</time>
                  </li>
                ))}
              </ul>
            </>
          )}
          {audits.length > 0 && (
            <>
              <h4 className="activity-detail-subtitle">{t("activity.auditTrail")}</h4>
              <ul className="activity-trace-list">
                {audits.map((entry) => (
                  <li key={entry.eventId}>
                    <span className="activity-trace-kind">{entry.type}</span>
                    <span>{entry.summary}</span>
                    <time dateTime={entry.createdAt}>{fmtWhen(entry.createdAt)}</time>
                  </li>
                ))}
              </ul>
            </>
          )}
          {artifacts && artifacts.length > 0 && (
            <>
              <h4 className="activity-detail-subtitle">{t("artifactRenderer.title", "Artifacts")}</h4>
              <ArtifactList artifacts={artifacts} />
            </>
          )}
          {journal.length === 0 && audits.length === 0 && !artifacts && (
            <p className="field-desc">{t("activity.noCorrelated")}</p>
          )}
        </>
      )}
    </div>
  );
}

function extractArtifacts(payload: TaskResultPayload): Artifact[] {
  return Array.isArray(payload.artifacts) ? payload.artifacts : [];
}

/** Owner Activity timeline (Phase 13D / US-AV8 filters). */
export function ActivityView({ embedded = false }: { embedded?: boolean }) {
  const t = useT();
  const nodeService = useNodeService();
  const [rows, setRows] = useState<AgentActivityRecord[]>([]);
  const [bonds, setBonds] = useState<BondRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [domainFilter, setDomainFilter] = useState<AgentActivityDomain | "all">("all");
  const [contactFilter, setContactFilter] = useState<string>("all");
  const [datePreset, setDatePreset] = useState<DateRangePreset>("all");
  const [customDay, setCustomDay] = useState("");
  const [selected, setSelected] = useState<AgentActivityRecord | null>(null);

  const domainLabel = useCallback(
    (domain: AgentActivityDomain) => t(`activity.domains.${domain}`),
    [t],
  );

  const kindLabel = useCallback(
    (kind: AgentActivityRecord["kind"]) => t(`activity.kinds.${kind}`),
    [t],
  );

  const bondLabels = useMemo(() => {
    const map = new Map<string, string>();
    for (const bond of bonds) {
      map.set(bond.peerOwnerId, contactLabel(bond));
    }
    return map;
  }, [bonds]);

  const dateRange = useMemo(
    () => resolveDateRange(datePreset, customDay),
    [datePreset, customDay],
  );

  useEffect(() => {
    void nodeService.getBonds().then(setBonds).catch(() => setBonds([]));
  }, [nodeService]);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const list = await nodeService.listAgentActivity({
        limit: 200,
        domain: domainFilter === "all" ? undefined : domainFilter,
        remoteOwnerId: contactFilter === "all" ? undefined : contactFilter,
        since: dateRange.since,
        until: dateRange.until,
      });
      setRows(list);
    } catch (err) {
      console.warn("[ActivityView] listAgentActivity failed:", err);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [nodeService, domainFilter, contactFilter, dateRange.since, dateRange.until]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    const unsub = nodeService.on("agent:activity", (record: AgentActivityRecord) => {
      if (domainFilter !== "all" && record.domain !== domainFilter) return;
      if (contactFilter !== "all" && record.remoteOwnerId !== contactFilter) return;
      if (dateRange.since && record.createdAt < dateRange.since) return;
      if (dateRange.until && record.createdAt >= dateRange.until) return;
      setRows((prev) => [record, ...prev.filter((row) => row.activityId !== record.activityId)]);
    });
    return unsub;
  }, [nodeService, domainFilter, contactFilter, dateRange.since, dateRange.until]);

  return (
    <div className={`activity-view${embedded ? " activity-view--embedded" : ""}`}>
      <div className="activity-header">
        <div>
          {!embedded ? (
            <>
              <h2 className="activity-title">{t("activity.title")}</h2>
              <p className="activity-subtitle">{t("activity.lede")}</p>
            </>
          ) : (
            <p className="section-desc">{t("activity.lede")}</p>
          )}
        </div>
        <div className="activity-filters">
          <label className="activity-filter-label" htmlFor="activity-domain-filter">
            {t("activity.filterDomain")}
          </label>
          <select
            id="activity-domain-filter"
            className="activity-filter-select"
            value={domainFilter}
            onChange={(e) =>
              setDomainFilter(e.target.value as AgentActivityDomain | "all")
            }
          >
            <option value="all">{t("activity.allDomains")}</option>
            {ACTIVITY_DOMAINS.map((key) => (
              <option key={key} value={key}>
                {domainLabel(key)}
              </option>
            ))}
          </select>

          <label className="activity-filter-label" htmlFor="activity-contact-filter">
            {t("activity.filterContact")}
          </label>
          <select
            id="activity-contact-filter"
            className="activity-filter-select"
            value={contactFilter}
            onChange={(e) => setContactFilter(e.target.value)}
          >
            <option value="all">{t("activity.allContacts")}</option>
            {bonds.map((bond) => (
              <option key={bond.peerOwnerId} value={bond.peerOwnerId}>
                {contactLabel(bond)}
              </option>
            ))}
          </select>

          <label className="activity-filter-label" htmlFor="activity-date-filter">
            {t("activity.filterWhen")}
          </label>
          <select
            id="activity-date-filter"
            className="activity-filter-select"
            value={datePreset}
            onChange={(e) => setDatePreset(e.target.value as DateRangePreset)}
          >
            <option value="all">{t("activity.dateAll")}</option>
            <option value="today">{t("activity.dateToday")}</option>
            <option value="7d">{t("activity.date7d")}</option>
            <option value="custom">{t("activity.dateCustom")}</option>
          </select>
          {datePreset === "custom" ? (
            <input
              type="date"
              className="activity-filter-select"
              value={customDay}
              onChange={(e) => setCustomDay(e.target.value)}
              aria-label={t("activity.customDayAria")}
            />
          ) : null}
        </div>
      </div>

      {selected ? <ActivityDetailPanel row={selected} onClose={() => setSelected(null)} /> : null}

      {loading ? (
        <div className="empty-state">
          <div className="empty-state-desc">{t("activity.loading")}</div>
        </div>
      ) : rows.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-title">{t("activity.empty")}</div>
          <div className="empty-state-desc">{t("activity.emptyDesc")}</div>
        </div>
      ) : (
        <ul className="activity-list">
          {rows.map((row) => (
            <li key={row.activityId}>
              <button
                type="button"
                className={`activity-row${selected?.activityId === row.activityId ? " activity-row--selected" : ""}`}
                onClick={() => setSelected((prev) => (prev?.activityId === row.activityId ? null : row))}
              >
                <div className="activity-row-meta">
                  <span className="activity-kind">{kindLabel(row.kind)}</span>
                  <span className="activity-domain">{domainLabel(row.domain)}</span>
                  {row.remoteOwnerId ? (
                    <span className="activity-contact">
                      {bondLabels.get(row.remoteOwnerId) ??
                        row.remoteOwnerId.replace(/^envoy:owner:/, "").slice(0, 12)}
                    </span>
                  ) : null}
                  <time className="activity-time" dateTime={row.createdAt}>
                    {fmtWhen(row.createdAt)}
                  </time>
                </div>
                <p className="activity-summary">{row.summary}</p>
                {(row.taskId || row.correlationId) && (
                  <div className="activity-refs">
                    {row.taskId ? <span className="activity-ref">task: {row.taskId}</span> : null}
                    {row.correlationId ? (
                      <span className="activity-ref">corr: {row.correlationId.slice(0, 12)}…</span>
                    ) : null}
                  </div>
                )}
                {row.requiresOwnerAction ? (
                  <span className="activity-action-badge">{t("activity.needsAction")}</span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
