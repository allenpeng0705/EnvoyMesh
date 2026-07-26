/**
 * Draft with AI — label-row trigger, intent sheet, review card.
 * Surfaces: bio | blog | section | caption | feed.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  defaultModeForExistingText,
  defaultTonesForSurface,
  type AuthorContentMode,
  type AuthorContentSurface,
  type AuthorContentTone,
  type DraftAuthorContentParams,
} from "@envoymesh/api";
import { useT, useI18n } from "../context/I18nContext.js";
import { useNodeState } from "../context/NodeStateContext.js";
import { useNodeService } from "../hooks/useNodeService.js";

export interface AuthorAiDraftFieldProps {
  surface: AuthorContentSurface;
  /** Field label text (e.g. Bio, Story, Caption). */
  label: string;
  htmlFor: string;
  /** Current field value (bio / body / caption). */
  value: string;
  onApply: (text: string, action: "insert" | "replace") => void;
  title?: string;
  disabled?: boolean;
  /** The input / editor control. */
  children: ReactNode;
}

function toneLabel(t: (k: string, f?: string) => string, tone: AuthorContentTone): string {
  return t(`browser.authorAi.tone.${tone}`, tone.charAt(0).toUpperCase() + tone.slice(1));
}

function modeLabel(t: (k: string, f?: string) => string, mode: AuthorContentMode): string {
  switch (mode) {
    case "write":
      return t("browser.authorAi.modeWrite", "Write new");
    case "rewrite":
      return t("browser.authorAi.modeRewrite", "Rewrite");
    case "expand":
      return t("browser.authorAi.modeExpand", "Expand");
    case "shorten":
      return t("browser.authorAi.modeShorten", "Shorten");
  }
}

function surfaceTitle(t: (k: string, f?: string) => string, surface: AuthorContentSurface): string {
  switch (surface) {
    case "bio":
      return t("browser.authorAi.sheetBio", "Draft bio");
    case "blog":
      return t("browser.authorAi.sheetBlog", "Draft blog post");
    case "section":
      return t("browser.authorAi.sheetSection", "Draft section");
    case "caption":
      return t("browser.authorAi.sheetCaption", "Draft caption");
    case "feed":
      return t("browser.authorAi.sheetFeed", "Draft Feed update");
  }
}

export function AuthorAiDraftField({
  surface,
  label,
  htmlFor,
  value,
  onApply,
  title,
  disabled,
  children,
}: AuthorAiDraftFieldProps) {
  const t = useT();
  const { locale } = useI18n();
  const nodeService = useNodeService();
  const { nodeConfig, humanProfile } = useNodeState();

  /** Settings → AI provider mode; Draft with AI only when not disabled. */
  const aiReady = (nodeConfig?.modelProviders?.mode ?? "disabled") !== "disabled";
  const tones = useMemo(() => defaultTonesForSurface(surface), [surface]);
  const hasExisting = Boolean(value.trim());

  const [sheetOpen, setSheetOpen] = useState(false);
  const [hint, setHint] = useState("");
  const [tone, setTone] = useState<AuthorContentTone>(tones[0]!);
  const [mode, setMode] = useState<AuthorContentMode>(defaultModeForExistingText(value));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const triggerDisabled = Boolean(disabled || busy || !aiReady);

  useEffect(() => {
    if (!sheetOpen) return;
    setTone(tones[0]!);
    setMode(defaultModeForExistingText(value));
    setError(null);
  }, [sheetOpen, tones, value]);

  async function generate() {
    if (!aiReady) {
      setError(t("browser.authorAi.noModel", "No AI model configured. Open Settings → AI."));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const params: DraftAuthorContentParams = {
        surface,
        mode: hasExisting ? mode : "write",
        tone,
        hint: hint.trim() || undefined,
        title: title?.trim() || undefined,
        existingText: value.trim() || undefined,
        locale,
        profileContext:
          surface === "bio"
            ? {
                displayName: humanProfile?.displayName,
                username: humanProfile?.username,
                hobbies: humanProfile?.hobbies,
                knowledge: humanProfile?.knowledge,
              }
            : undefined,
      };
      const result = await nodeService.draftAuthorContent(params);
      if (!result.ok) {
        const reason = result.reason;
        setError(
          reason === "no_model_providers"
            ? t("browser.authorAi.noModel", "No AI model configured. Open Settings → AI.")
            : t("browser.authorAi.failed", "Could not draft content ({reason})", { reason }),
        );
        return;
      }
      setDraft(result.text);
      setSheetOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("browser.authorAi.failedGeneric", "Draft failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="author-ai-draft" data-testid={`author-ai-draft-${surface}`}>
      <div className="author-ai-draft__label-row">
        <label className="field-label" htmlFor={htmlFor}>
          {label}
        </label>
        <button
          type="button"
          className="author-ai-draft__trigger"
          data-testid={`author-ai-draft-trigger-${surface}`}
          disabled={triggerDisabled}
          aria-disabled={triggerDisabled}
          title={
            aiReady
              ? t("browser.authorAi.triggerTitle", "Draft this field with your AI agent")
              : t("browser.authorAi.triggerDisabled", "Turn on AI in Settings → AI")
          }
          onClick={() => {
            if (!aiReady) return;
            setError(null);
            setSheetOpen(true);
          }}
        >
          {t("browser.authorAi.trigger", "Draft with AI")}
        </button>
      </div>

      {error && !sheetOpen ? (
        <p className="author-ai-draft__error" role="alert">
          {error}
        </p>
      ) : null}

      {draft ? (
        <div
          className="author-ai-draft__card"
          role="region"
          aria-label={t("browser.authorAi.draftAria", "AI draft")}
          data-testid={`author-ai-draft-card-${surface}`}
        >
          <span className="author-ai-draft__card-label">{t("browser.authorAi.draftLabel", "AI draft")}</span>
          <pre className="author-ai-draft__card-text">{draft}</pre>
          <div className="author-ai-draft__card-actions">
            <button
              type="button"
              className="btn-secondary btn-small"
              onClick={() => setDraft(null)}
              disabled={disabled || busy}
            >
              {t("browser.authorAi.discard", "Discard")}
            </button>
            {hasExisting ? (
              <>
                <button
                  type="button"
                  className="btn-secondary btn-small"
                  data-testid={`author-ai-draft-insert-${surface}`}
                  onClick={() => {
                    onApply(draft, "insert");
                    setDraft(null);
                  }}
                  disabled={disabled || busy}
                >
                  {t("browser.authorAi.insert", "Insert")}
                </button>
                <button
                  type="button"
                  className="primary btn-small"
                  data-testid={`author-ai-draft-replace-${surface}`}
                  onClick={() => {
                    onApply(draft, "replace");
                    setDraft(null);
                  }}
                  disabled={disabled || busy}
                >
                  {t("browser.authorAi.replace", "Replace")}
                </button>
              </>
            ) : (
              <button
                type="button"
                className="primary btn-small"
                data-testid={`author-ai-draft-insert-${surface}`}
                onClick={() => {
                  onApply(draft, "insert");
                  setDraft(null);
                }}
                disabled={disabled || busy}
              >
                {t("browser.authorAi.insert", "Insert")}
              </button>
            )}
          </div>
        </div>
      ) : null}

      {children}

      {sheetOpen ? (
        <div
          className="author-ai-draft__backdrop"
          role="presentation"
          onClick={() => !busy && setSheetOpen(false)}
        >
          <div
            className="author-ai-draft__sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby={`author-ai-sheet-title-${surface}`}
            data-testid={`author-ai-draft-sheet-${surface}`}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id={`author-ai-sheet-title-${surface}`}>{surfaceTitle(t, surface)}</h3>
            <p className="field-desc">
              {t("browser.authorAi.hintLabel", "What should it emphasize? (optional)")}
            </p>
            <textarea
              className="author-ai-draft__hint"
              data-testid={`author-ai-draft-hint-${surface}`}
              value={hint}
              onChange={(e) => setHint(e.target.value)}
              disabled={busy}
              rows={3}
              placeholder={t(
                "browser.authorAi.hintPlaceholder",
                "e.g. focus on music and building P2P tools",
              )}
            />

            {hasExisting ? (
              <div className="author-ai-draft__modes" role="group" aria-label={t("browser.authorAi.modeLabel", "Mode")}>
                {(["rewrite", "expand", "shorten"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    className={`author-ai-draft__chip ${mode === m ? "active" : ""}`}
                    disabled={busy}
                    onClick={() => setMode(m)}
                  >
                    {modeLabel(t, m)}
                  </button>
                ))}
              </div>
            ) : null}

            <div className="author-ai-draft__tones" role="group" aria-label={t("browser.authorAi.toneLabel", "Tone")}>
              {tones.map((toneOption) => (
                <button
                  key={toneOption}
                  type="button"
                  className={`author-ai-draft__chip ${tone === toneOption ? "active" : ""}`}
                  disabled={busy}
                  onClick={() => setTone(toneOption)}
                >
                  {toneLabel(t, toneOption)}
                </button>
              ))}
            </div>

            {error ? (
              <p className="author-ai-draft__error" role="alert">
                {error}
              </p>
            ) : null}

            <div className="author-ai-draft__sheet-actions">
              <button
                type="button"
                className="btn-secondary"
                disabled={busy}
                onClick={() => setSheetOpen(false)}
              >
                {t("common.cancel", "Cancel")}
              </button>
              <button
                type="button"
                className="primary"
                data-testid={`author-ai-draft-generate-${surface}`}
                disabled={busy}
                onClick={() => void generate()}
              >
                {busy
                  ? t("browser.authorAi.generating", "Generating…")
                  : t("browser.authorAi.generate", "Generate")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function applyAuthorDraft(
  previous: string,
  draft: string,
  action: "insert" | "replace",
): string {
  if (action === "replace" || !previous.trim()) return draft;
  return `${previous.trim()}\n\n${draft}`;
}
