/**
 * Browse folders on the home node via listHomeFsEntries (web Social).
 * Tauri uses the native OS dialog instead — see HomeFolderPicker.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useT } from "../context/I18nContext.js";
import { useNodeService } from "../hooks/useNodeService.js";
import { ModalPortal } from "./ModalPortal.js";

export interface HomeFolderBrowserModalProps {
  title?: string;
  initialPath?: string;
  onSelect: (path: string) => void;
  onClose: () => void;
}

export function HomeFolderBrowserModal({
  title,
  initialPath,
  onSelect,
  onClose,
}: HomeFolderBrowserModalProps) {
  const t = useT();
  const nodeService = useNodeService();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [platform, setPlatform] = useState("other");
  const [currentPath, setCurrentPath] = useState("");
  const [parent, setParent] = useState<string | undefined>();
  const [entries, setEntries] = useState<
    Array<{ name: string; kind: string; path: string }>
  >([]);
  const [showingRoots, setShowingRoots] = useState(false);
  const [roots, setRoots] = useState<string[]>([]);
  /** Keep latest platform/roots for loadPath without stale bootstrap closure. */
  const platformRef = useRef(platform);
  const rootsRef = useRef(roots);
  platformRef.current = platform;
  rootsRef.current = roots;

  const applyListing = useCallback(
    (result: {
      path?: string;
      parent?: string;
      entries?: Array<{ name: string; kind: string; path: string }>;
    }) => {
      setShowingRoots(false);
      setCurrentPath(result.path ?? "");
      setParent(result.parent);
      setEntries(
        (result.entries ?? [])
          .filter((e) => e.kind === "dir")
          .map((e) => ({ name: e.name, kind: e.kind, path: e.path })),
      );
    },
    [],
  );

  const loadPath = useCallback(
    async (path: string | null | undefined, opts?: { roots?: boolean }) => {
      setLoading(true);
      setError(null);
      try {
        if (opts?.roots && platformRef.current === "win32") {
          setShowingRoots(true);
          setCurrentPath("");
          setParent(undefined);
          setEntries(
            rootsRef.current.map((r) => ({ name: r, kind: "dir", path: r })),
          );
          setLoading(false);
          return;
        }
        const result = await nodeService.listHomeFsEntries({
          path: path ?? undefined,
          dirsOnly: true,
        });
        applyListing(result);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    },
    [applyListing, nodeService],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const info = await nodeService.getHomeFsInfo();
        if (cancelled) return;
        const homeDir = info.homeDir ?? "";
        const nextPlatform = info.platform ?? "other";
        const nextRoots = info.roots ?? [];
        platformRef.current = nextPlatform;
        rootsRef.current = nextRoots;
        setPlatform(nextPlatform);
        setRoots(nextRoots);
        const start =
          initialPath?.trim() || homeDir || (nextRoots[0] ?? "/");
        const result = await nodeService.listHomeFsEntries({
          path: start,
          dirsOnly: true,
        });
        if (cancelled) return;
        applyListing(result);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // Bootstrap once on open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const dialogTitle =
    title ?? t("settings.ai.aiEngine.projectFolderTitle", "Choose project folder");

  return (
    <ModalPortal>
      <div className="modal-overlay" role="presentation" onClick={onClose}>
        <div
          className="modal-panel home-folder-browser-modal"
          role="dialog"
          aria-modal="true"
          aria-label={dialogTitle}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="modal-header">
            <h2>{dialogTitle}</h2>
            <button
              type="button"
              className="modal-close"
              aria-label={t("common.close", "Close")}
              onClick={onClose}
            >
              ×
            </button>
          </div>
          <p className="home-folder-browser-path">
            {showingRoots
              ? t("settings.ai.aiEngine.drives", "Drives")
              : currentPath || "…"}
          </p>
          {error ? <p className="home-folder-picker-error">{error}</p> : null}
          <div className="home-folder-browser-list">
            {loading ? (
              <p className="home-folder-browser-empty">{t("common.loading")}</p>
            ) : (
              <ul>
                {platform === "win32" && !showingRoots ? (
                  <li>
                    <button
                      type="button"
                      className="home-folder-browser-item"
                      onClick={() => void loadPath(null, { roots: true })}
                    >
                      {t("settings.ai.aiEngine.drives", "Drives")}
                    </button>
                  </li>
                ) : null}
                {parent && !showingRoots ? (
                  <li>
                    <button
                      type="button"
                      className="home-folder-browser-item"
                      onClick={() => void loadPath(parent)}
                    >
                      ..
                    </button>
                  </li>
                ) : null}
                {entries.map((entry) => (
                  <li key={entry.path}>
                    <button
                      type="button"
                      className="home-folder-browser-item"
                      onClick={() => void loadPath(entry.path)}
                    >
                      {entry.name}
                    </button>
                  </li>
                ))}
                {!loading && entries.length === 0 ? (
                  <li className="home-folder-browser-empty">
                    {t("settings.ai.aiEngine.noSubfolders", "No subfolders")}
                  </li>
                ) : null}
              </ul>
            )}
          </div>
          <div className="modal-actions">
            <button type="button" className="secondary" onClick={onClose}>
              {t("common.cancel", "Cancel")}
            </button>
            <button
              type="button"
              className="primary"
              disabled={!currentPath || showingRoots}
              onClick={() => onSelect(currentPath)}
            >
              {t("common.confirm")}
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
