/**
 * Settings → AI → Coding tools
 *
 * Envoy / Pi are built into EnvoyMesh. Everything else is an external CLI on
 * the home computer that the Coding tab can drive — EnvoyMesh does not ship
 * or configure those products; this page only checks Ready / Not ready and
 * shows how to install or fix PATH when the user wants to use one.
 *
 * Layout mirrors EnvoyDev Agents: built-in → featured “used by Coding” →
 * full catalogue behind one disclosure (so Settings is scannable).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CODING_ALL_HARNESSES,
  CODING_FEATURED_HARNESSES,
  CODING_TIER_A_HARNESSES,
  codingHarnessLabel,
  isCodingFeaturedHarness,
  isCodingTierBHarness,
  type CodingHarnessId,
} from "@envoymesh/api";
import { useT } from "../../../context/I18nContext.js";
import { useNodeService } from "../../../hooks/useNodeService.js";
import {
  probeCodingHarness,
  type HarnessProbeResult,
} from "../../../lib/coding-harness-probe.js";

type RowState = HarnessProbeResult;

function renderRow(opts: {
  id: CodingHarnessId;
  row: RowState | undefined;
  open: boolean;
  onToggle: () => void;
  checking: boolean;
  onRecheck: () => void;
  t: ReturnType<typeof useT>;
}) {
  const { id, row, open, onToggle, checking, onRecheck, t } = opts;
  const badge = row?.badge ?? "checking";
  const line = row?.line?.trim() ?? "";
  const name = codingHarnessLabel(id);
  const copyCmd = async (cmd: string) => {
    try {
      await navigator.clipboard.writeText(cmd);
    } catch {
      /* ignore */
    }
  };

  return (
    <li key={id} className="coding-agents-settings__row">
      <div className="coding-agents-settings__row-main">
        <div className="coding-agents-settings__row-text">
          <span className="coding-agents-settings__name">{name}</span>
          {line ? (
            <p
              className={
                row?.installCommand && line === row.installCommand
                  ? "coding-agents-settings__line coding-agents-settings__line--cmd"
                  : "coding-agents-settings__line"
              }
              title={line}
            >
              {line}
            </p>
          ) : null}
        </div>
        {badge === "ready" ? (
          <span
            className="agent-block-status agent-block-status--on"
            data-testid={`coding-agents-verdict-${id}`}
          >
            {t("settings.ai.codingAgents.ready", "Ready")}
          </span>
        ) : badge === "checking" ? (
          <span
            className="agent-block-status agent-block-status--off"
            data-testid={`coding-agents-verdict-${id}`}
          >
            {t("settings.ai.codingAgents.checking", "Checking…")}
          </span>
        ) : (
          <button
            type="button"
            className="agent-block-status agent-block-status--warn coding-agents-settings__verdict-btn"
            data-testid={`coding-agents-verdict-${id}`}
            aria-expanded={open}
            aria-label={t(
              "settings.ai.codingAgents.notReadyAria",
              "Not ready — see how to resolve this for {agent}",
              { agent: name },
            )}
            onClick={onToggle}
          >
            {t("settings.ai.codingAgents.notReady", "Not ready")}
          </button>
        )}
      </div>
      {open && row ? (
        <div
          className="coding-agents-settings__guide"
          data-testid={`coding-agents-guide-${id}`}
        >
          <p>
            {row.hint?.trim() ||
              t(
                "settings.ai.codingAgents.resolveBody",
                "{name} isn’t ready on this home computer yet. Install or fix it there, then tap Check again. EnvoyMesh only uses it from Coding — it does not configure the product itself.",
                { name },
              )}
          </p>
          {row.installCommand ? (
            <div className="coding-agents-settings__cmd-block">
              <span className="agent-field-label">
                {(row.hint ?? "").toLowerCase().includes("fetched from npm") ||
                (row.hint ?? "").toLowerCase().includes("fetched from pypi")
                  ? t(
                      "settings.ai.codingAgents.firstRunCmd",
                      "First-run command (run on this computer)",
                    )
                  : t(
                      "settings.ai.codingAgents.installCmd",
                      "Install command (run on this computer)",
                    )}
              </span>
              <code className="coding-agents-settings__cmd">
                {row.installCommand}
              </code>
              <button
                type="button"
                className="settings-button"
                onClick={() => void copyCmd(row.installCommand!)}
              >
                {t("settings.ai.codingAgents.copyCmd", "Copy command")}
              </button>
            </div>
          ) : null}
          <div className="coding-agents-settings__guide-actions">
            {row.installLink ? (
              <a
                href={row.installLink}
                target="_blank"
                rel="noreferrer"
                className="settings-button"
              >
                {t("settings.ai.codingAgents.openDocs", "Open docs")}
              </a>
            ) : null}
            <button
              type="button"
              className="settings-button"
              disabled={checking}
              onClick={onRecheck}
            >
              {t("settings.ai.codingAgents.recheck", "Check again")}
            </button>
          </div>
        </div>
      ) : null}
    </li>
  );
}

export function CodingAgentsSettings() {
  const t = useT();
  const nodeService = useNodeService();
  const [rows, setRows] = useState<
    Partial<Record<CodingHarnessId, RowState>>
  >({});
  const [checking, setChecking] = useState(false);
  const [expanded, setExpanded] = useState<CodingHarnessId | null>(null);
  const [catalogueOpen, setCatalogueOpen] = useState(false);

  const builtIn = useMemo(
    () => [...CODING_TIER_A_HARNESSES] as CodingHarnessId[],
    [],
  );
  const featuredExternal = useMemo(
    () =>
      CODING_FEATURED_HARNESSES.filter((id) =>
        isCodingTierBHarness(id),
      ) as CodingHarnessId[],
    [],
  );
  /** Full catalog minus featured — same idea as EnvoyDev’s Catalogue group. */
  const catalogue = useMemo(
    () =>
      (CODING_ALL_HARNESSES as readonly string[])
        .filter(
          (id) =>
            isCodingTierBHarness(id) && !isCodingFeaturedHarness(id),
        )
        .sort((a, b) =>
          codingHarnessLabel(a).localeCompare(codingHarnessLabel(b)),
        ) as CodingHarnessId[],
    [],
  );

  const primaryIds = useMemo(
    () => [...builtIn, ...featuredExternal],
    [builtIn, featuredExternal],
  );
  const probeIds = useMemo(
    () =>
      catalogueOpen ? [...primaryIds, ...catalogue] : primaryIds,
    [primaryIds, catalogue, catalogueOpen],
  );

  const recheck = useCallback(async () => {
    if (!nodeService.isConnected) return;
    const ids = probeIds;
    setChecking(true);
    setRows((prev) => {
      const next = { ...prev };
      for (const id of ids) {
        next[id] = { badge: "checking", line: undefined };
      }
      return next;
    });
    const next: Partial<Record<CodingHarnessId, RowState>> = {};
    await Promise.all(
      ids.map(async (id) => {
        next[id] = await probeCodingHarness(nodeService, id);
      }),
    );
    setRows((prev) => ({ ...prev, ...next }));
    setChecking(false);
  }, [nodeService, probeIds]);

  useEffect(() => {
    void recheck();
    // Probe when connection or catalogue disclosure changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeService.isConnected, catalogueOpen]);

  const readyBuiltIn = builtIn.filter((id) => rows[id]?.badge === "ready").length;
  const readyFeatured = featuredExternal.filter(
    (id) => rows[id]?.badge === "ready",
  ).length;
  const readyCatalogue = catalogue.filter(
    (id) => rows[id]?.badge === "ready",
  ).length;

  const rowProps = (id: CodingHarnessId) => ({
    id,
    row: rows[id],
    open: expanded === id && rows[id]?.badge === "not-ready",
    onToggle: () => setExpanded(expanded === id ? null : id),
    checking,
    onRecheck: () => void recheck(),
    t,
  });

  return (
    <div className="coding-agents-settings" data-testid="coding-agents-settings">
      <div className="coding-agents-settings__head">
        <p className="section-desc">
          {t(
            "settings.ai.codingAgents.intro",
            "Envoy and Pi are built into EnvoyMesh. Other tools are CLIs on this computer — Coding just uses them. Featured tools are listed here; the full catalogue is below.",
          )}
        </p>
        <button
          type="button"
          className="settings-button"
          disabled={checking || !nodeService.isConnected}
          onClick={() => void recheck()}
          data-testid="coding-agents-recheck"
          title={t(
            "settings.ai.codingAgents.recheckHint",
            "Re-check whether each tool is on PATH. Does not start agents or install packages.",
          )}
        >
          {checking
            ? t("settings.ai.codingAgents.checking", "Checking…")
            : t("settings.ai.codingAgents.recheck", "Check again")}
        </button>
      </div>

      <p className="coding-agents-settings__count">
        {t(
          "settings.ai.codingAgents.groupBuiltIn",
          "In EnvoyMesh · {ready}/{total} ready",
          { ready: readyBuiltIn, total: builtIn.length },
        )}
      </p>
      <ul className="coding-agents-settings__list">
        {builtIn.map((id) => renderRow(rowProps(id)))}
      </ul>

      <p className="coding-agents-settings__count coding-agents-settings__count--spaced">
        {t(
          "settings.ai.codingAgents.groupExternal",
          "Used by Coding (featured) · {ready}/{total} ready",
          { ready: readyFeatured, total: featuredExternal.length },
        )}
      </p>
      <p className="coding-agents-settings__group-hint">
        {t(
          "settings.ai.codingAgents.externalHint",
          "Shown on the new-task picker. Install and sign in yourself — EnvoyMesh only runs them when you pick one in Coding.",
        )}
      </p>
      <ul className="coding-agents-settings__list">
        {featuredExternal.map((id) => renderRow(rowProps(id)))}
      </ul>

      <p className="coding-agents-settings__count coding-agents-settings__count--spaced">
        {t(
          "settings.ai.codingAgents.groupCatalogue",
          "Catalogue · {total}",
          { total: catalogue.length },
        )}
        {catalogueOpen
          ? ` · ${t("settings.ai.codingAgents.catalogueReady", "{ready} ready", {
              ready: readyCatalogue,
            })}`
          : ""}
      </p>
      <p className="coding-agents-settings__group-hint">
        {t(
          "settings.ai.codingAgents.catalogueHint",
          "Every other CLI Coding can drive. Same Ready / Not ready check — not part of EnvoyMesh.",
        )}
      </p>
      {!catalogueOpen ? (
        <button
          type="button"
          className="settings-button"
          data-testid="coding-agents-browse-catalogue"
          onClick={() => setCatalogueOpen(true)}
        >
          {t(
            "settings.ai.codingAgents.browseCatalogue",
            "Browse the catalogue ({total})",
            { total: catalogue.length },
          )}
        </button>
      ) : (
        <>
          <button
            type="button"
            className="settings-button"
            onClick={() => setCatalogueOpen(false)}
          >
            {t("settings.ai.codingAgents.hideCatalogue", "Hide catalogue")}
          </button>
          <ul className="coding-agents-settings__list" style={{ marginTop: "0.5rem" }}>
            {catalogue.map((id) => renderRow(rowProps(id)))}
          </ul>
        </>
      )}
    </div>
  );
}
