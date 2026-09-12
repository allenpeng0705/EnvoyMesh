import { useCallback, useEffect, useMemo, useState } from "react";
import { useT } from "../../context/I18nContext.js";
import { useTerminalSessions } from "../../hooks/useNodeService.js";
import { loadCodingProjects, CODING_PROJECTS_CHANGED_EVENT } from "../../lib/coding-projects.js";
import type { CodingSessionRef } from "../../lib/coding-session-ref.js";
import {
  codingExtStatusLabel,
  codingExtStatusShowsChip,
  codingUiBucketLabel,
  codingUiBucketShowsChip,
  type ExtProbeStatus,
} from "../../lib/coding-status-label.js";
import {
  OPEN_CODING_EVENT,
  clearCodingReviewReadonly,
  isCodingReviewReadonly,
  takePendingCodingOpen,
  type OpenCodingDetail,
} from "../../lib/open-coding-nav.js";
import { CodingSidebar } from "./CodingSidebar.js";
import { CodingWorkspaceShell } from "./CodingWorkspaceShell.js";
import { EnvoyHarnessPanel } from "./EnvoyHarnessPanel.js";
import { CodingHarnessPanel } from "./ExtAgentCodingPanel.js";
import { PiCodingPanel } from "./PiCodingPanel.js";
import { codingHarnessLabel } from "@envoymesh/api";

export type CodingViewProps = {
  /** Whether the Coding tab is the visible top view. */
  active: boolean;
};

/**
 * Coding tab: Projects | Workspace (Chat/Shell).
 * Changes is a closable overlay over the workspace (Paseo Cmd+E pattern).
 */
export function CodingView({ active }: CodingViewProps) {
  const t = useT();
  const { sessions: terminalSessions } = useTerminalSessions();
  const [selected, setSelected] = useState<CodingSessionRef | null>(null);
  const [reviewOnly, setReviewOnly] = useState(() => isCodingReviewReadonly());
  const [openCreateRequest, setOpenCreateRequest] = useState(0);
  const [openAddProjectRequest, setOpenAddProjectRequest] = useState(0);
  const [openDefaultsRequest, setOpenDefaultsRequest] = useState(0);
  const [changesOpen, setChangesOpen] = useState(false);
  const [ehChangedFiles, setEhChangedFiles] = useState<string[]>([]);
  const [openEhReviewRequest, setOpenEhReviewRequest] = useState(0);
  const [piBusy, setPiBusy] = useState(false);
  const [extStatus, setExtStatus] = useState<ExtProbeStatus | null>(null);
  const [projectCount, setProjectCount] = useState(
    () => loadCodingProjects().length,
  );

  const selectSession = (ref: CodingSessionRef | null) => {
    setSelected(ref);
    setPiBusy(false);
    setExtStatus(null);
    setEhChangedFiles([]);
    if (!ref || ref.kind !== "eh") {
      setReviewOnly(false);
      clearCodingReviewReadonly();
    } else if (!isCodingReviewReadonly()) {
      setReviewOnly(false);
    }
  };

  useEffect(() => {
    const runDetail = (detail?: OpenCodingDetail | null) => {
      if (!detail) return;
      if (detail.startNew) {
        setReviewOnly(false);
        clearCodingReviewReadonly();
        const projects = loadCodingProjects();
        if (projects.length === 0) {
          setOpenAddProjectRequest((n) => n + 1);
        } else {
          setOpenCreateRequest((n) => n + 1);
        }
        return;
      }
      const chatId = detail.chatId?.trim();
      if (chatId) {
        setReviewOnly(Boolean(detail.reviewOnly) || isCodingReviewReadonly());
        setSelected({ kind: "eh", chatId });
        return;
      }
      const sessionId = detail.sessionId?.trim();
      if (sessionId || detail.harness === "pi") {
        setReviewOnly(false);
        clearCodingReviewReadonly();
        if (sessionId) setSelected({ kind: "pi", sessionId });
        else setOpenCreateRequest((n) => n + 1);
      }
    };
    runDetail(takePendingCodingOpen());
    const onOpen = (ev: Event) => {
      // Drain pending so a later mount does not re-apply this open.
      takePendingCodingOpen();
      const detail = (ev as CustomEvent<OpenCodingDetail>).detail;
      runDetail(detail);
    };
    window.addEventListener(OPEN_CODING_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_CODING_EVENT, onOpen);
  }, []);

  useEffect(() => {
    if (!selected) setChangesOpen(false);
  }, [selected]);

  // Refresh home empty copy when projects change in localStorage (sidebar writes).
  useEffect(() => {
    const tick = () => setProjectCount(loadCodingProjects().length);
    tick();
    window.addEventListener(CODING_PROJECTS_CHANGED_EVENT, tick);
    return () => window.removeEventListener(CODING_PROJECTS_CHANGED_EVENT, tick);
  }, []);

  const piSession = useMemo(() => {
    if (selected?.kind !== "pi") return null;
    if (selected.session) return selected.session;
    return (
      terminalSessions.find((s) => s.sessionId === selected.sessionId) ?? null
    );
  }, [selected, terminalSessions]);

  const workspaceTitle =
    selected?.kind === "eh"
      ? selected.title?.trim() ||
        t("codingView.newSessionTitle", "New workspace")
      : selected?.kind === "pi"
        ? piSession?.title?.trim() || t("pi.title", "Pi")
        : selected?.kind === "ext"
          ? selected.title?.trim() ||
            codingHarnessLabel(selected.harness)
          : "";

  const workspaceCwd =
    selected?.kind === "eh"
      ? selected.cwd
      : selected?.kind === "pi"
        ? piSession?.cwd
        : selected?.kind === "ext"
          ? selected.cwd
          : undefined;

  const statusLabel = useMemo(() => {
    if (!selected) return "";
    if (selected.kind === "eh") {
      if (reviewOnly) {
        return t("codingView.reviewOnlyBanner", "Review only");
      }
      if (!codingUiBucketShowsChip(selected.uiBucket)) return "";
      return codingUiBucketLabel(t, selected.uiBucket);
    }
    if (selected.kind === "pi") {
      return piBusy ? t("codingView.statusRunning", "Running") : "";
    }
    if (!codingExtStatusShowsChip(extStatus)) return "";
    return codingExtStatusLabel(t, extStatus);
  }, [selected, reviewOnly, piBusy, extStatus, t]);

  const toggleChanges = () => setChangesOpen((v) => !v);

  const handleTouchedFiles = useCallback((files: readonly string[]) => {
    setEhChangedFiles((prev) => {
      if (
        prev.length === files.length &&
        prev.every((p, i) => p === files[i])
      ) {
        return prev;
      }
      return [...files];
    });
  }, []);

  const changesOverlay =
    selected && changesOpen ? (
      <>
        <button
          type="button"
          className="coding-changes-backdrop"
          aria-label={t("codingView.closeChanges", "Close Changes")}
          data-testid="coding-changes-backdrop"
          onClick={() => setChangesOpen(false)}
        />
        <aside
          className="coding-changes-overlay"
          data-testid="coding-context-rail"
          aria-label={t("codingView.changesTitle", "Changes")}
        >
          <div className="coding-changes-overlay__header">
            <h3>{t("codingView.changesTitle")}</h3>
            <button
              type="button"
              className="coding-changes-overlay__close"
              onClick={() => setChangesOpen(false)}
              aria-label={t("codingView.closeChanges", "Close Changes")}
              data-testid="coding-changes-close"
            >
              ×
            </button>
          </div>
          <div className="coding-changes-overlay__body">
            {selected.kind === "eh" && ehChangedFiles.length > 0 ? (
              <div className="coding-changes-overlay__list" data-testid="coding-changes-file-list">
                <ul>
                  {ehChangedFiles.map((path) => (
                    <li key={path}>
                      <code>{path}</code>
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  className="secondary"
                  data-testid="coding-changes-open-review"
                  onClick={() => setOpenEhReviewRequest((n) => n + 1)}
                >
                  {t("codingView.reviewChanges", "Review changes")}
                </button>
              </div>
            ) : (
              <div className="coding-pane-empty">
                <p>
                  {t(
                    "codingView.changesPlaceholder",
                    "File changes for this workspace will show here.",
                  )}
                </p>
              </div>
            )}
          </div>
        </aside>
      </>
    ) : null;

  return (
    <div
      className="chat-view chat-view--coding"
      data-testid="coding-view"
      aria-hidden={!active}
    >
      <div className="chat-view-coding-shell">
        <CodingSidebar
          selected={selected}
          onSelect={selectSession}
          openDefaultsRequest={openDefaultsRequest}
          openCreateRequest={openCreateRequest}
          openAddProjectRequest={openAddProjectRequest}
          hotkeysEnabled={active}
          extBusySessionId={
            selected?.kind === "ext" && extStatus === "busy"
              ? selected.sessionId
              : null
          }
          piBusySessionId={
            selected?.kind === "pi" && piBusy ? selected.sessionId : null
          }
        />
        <section
          className="chat-area coding-session-pane"
          data-testid="coding-session-pane"
        >
          {selected?.kind === "eh" ? (
            <CodingWorkspaceShell
              key={`eh:${selected.chatId}`}
              title={workspaceTitle}
              cwd={workspaceCwd}
              statusLabel={statusLabel}
              onClose={() => selectSession(null)}
              changesOpen={changesOpen}
              onToggleChanges={toggleChanges}
              chatBody={
                <EnvoyHarnessPanel
                  key={selected.chatId}
                  chatId={selected.chatId}
                  readOnlyReview={reviewOnly}
                  onTouchedFilesChange={handleTouchedFiles}
                  openReviewRequest={openEhReviewRequest}
                />
              }
              shellBody={
                <div
                  className="coding-pane-empty"
                  data-testid="coding-shell-empty"
                >
                  <p>
                    {t(
                      "codingView.shellEmptyEh",
                      "No shell attached to this workspace yet. Use the Terminal tab for a plain shell.",
                    )}
                  </p>
                </div>
              }
            />
          ) : selected?.kind === "pi" ? (
            <CodingWorkspaceShell
              key={`pi:${selected.sessionId}`}
              title={workspaceTitle}
              cwd={workspaceCwd}
              statusLabel={statusLabel}
              onClose={() => selectSession(null)}
              changesOpen={changesOpen}
              onToggleChanges={toggleChanges}
              chatBody={
                <PiCodingPanel
                  key={selected.sessionId}
                  sessionId={selected.sessionId}
                  onBusyChange={setPiBusy}
                />
              }
            />
          ) : selected?.kind === "ext" ? (
            <CodingWorkspaceShell
              key={`ext:${selected.sessionId}`}
              title={workspaceTitle}
              cwd={workspaceCwd}
              statusLabel={statusLabel}
              onClose={() => selectSession(null)}
              changesOpen={changesOpen}
              onToggleChanges={toggleChanges}
              chatBody={
                <CodingHarnessPanel
                  key={selected.sessionId}
                  sessionId={selected.sessionId}
                  harness={selected.harness}
                  cwd={selected.cwd}
                  onStatusChange={setExtStatus}
                />
              }
            />
          ) : (
            <div className="coding-home" data-testid="coding-home">
              <div className="coding-home__brand">
                <h2>{t("codingView.homeTitle", "Coding")}</h2>
                <p>
                  {projectCount === 0
                    ? t(
                        "codingView.homeEmptyProjects",
                        "Add a project to start. Then create a workspace under that project.",
                      )
                    : t(
                        "codingView.homePickWorkspace",
                        "Select a workspace on the left, or use + on a project to create one.",
                      )}
                </p>
              </div>
              <div className="coding-home__tiles">
                <button
                  type="button"
                  className="coding-home__tile"
                  onClick={() => setOpenAddProjectRequest((n) => n + 1)}
                  data-testid="coding-home-add-project"
                >
                  <strong>{t("codingView.addProjectCta", "Add project")}</strong>
                  <span>
                    {t(
                      "codingView.homeAddProjectHint",
                      "Register a folder on your home node.",
                    )}
                  </span>
                </button>
                <button
                  type="button"
                  className="coding-home__tile"
                  onClick={() => setOpenDefaultsRequest((n) => n + 1)}
                  data-testid="coding-home-settings"
                >
                  <strong>
                    {t("codingView.settingsFooter", "Coding defaults")}
                  </strong>
                  <span>
                    {t(
                      "codingView.homeSettingsHint",
                      "Default agent and model for projects that have no override.",
                    )}
                  </span>
                </button>
              </div>
            </div>
          )}
          {changesOverlay}
        </section>
      </div>
    </div>
  );
}
