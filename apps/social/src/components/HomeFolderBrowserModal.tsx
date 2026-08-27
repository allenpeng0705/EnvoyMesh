/**
 * Browse folders on the home node via listHomeFsEntries (web Social).
 * Tauri uses the native OS dialog instead — see HomeFolderPicker.
 *
 * Starts at homeDir for convenience. Navigation:
 * - Parent (..) when not at filesystem root / drive root
 * - Computer (/) on macOS/Linux — jump to roots (usually `/`)
 * - Drives on Windows — jump to C:\, D:\, …
 * - Home — jump back to the home-node user directory
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
  const [homeDir, setHomeDir] = useState("");
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
          .filter((e) => e.kind === "dir" && !e.name.startsWith("."))
          .map((e) => ({ name: e.name, kind: e.kind, path: e.path })),
      );
    },
    [],
  );

  const showRootsList = useCallback(() => {
    setShowingRoots(true);
    setCurrentPath("");
    setParent(undefined);
    setEntries(
      rootsRef.current.map((r) => ({
        name: r === "/" ? "/" : r,
        kind: "dir",
        path: r,
      })),
    );
    setLoading(false);
    setError(null);
  }, []);

  const loadPath = useCallback(
    async (path: string | null | undefined, opts?: { roots?: boolean }) => {
      setLoading(true);
      setError(null);
      try {
        if (opts?.roots) {
          const rootList = rootsRef.current;
          // macOS/Linux: only `/` — open it directly instead of a one-item list.
          if (platformRef.current !== "win32" && rootList.length === 1) {
            const result = await nodeService.listHomeFsEntries({
              path: rootList[0],
              dirsOnly: true,
            });
            applyListing(result);
            return;
          }
          showRootsList();
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
    [applyListing, nodeService, showRootsList],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const info = await nodeService.getHomeFsInfo();
        if (cancelled) return;
        const nextHome = info.homeDir ?? "";
        const nextPlatform = info.platform ?? "other";
        const nextRoots = info.roots ?? [];
        platformRef.current = nextPlatform;
        rootsRef.current = nextRoots;
        setPlatform(nextPlatform);
        setHomeDir(nextHome);
        setRoots(nextRoots);
        const start =
          initialPath?.trim() || nextHome || (nextRoots[0] ?? "/");
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

  const rootsLabel =
    platform === "win32"
      ? t("settings.ai.aiEngine.folderRoots", "Drives")
      : t("settings.ai.aiEngine.folderComputer", "Computer");

  const atFilesystemRoot =
    !showingRoots &&
    roots.length > 0 &&
    roots.some((r) => r === currentPath);

  // Windows: always offer Drives so you can switch C: ↔ D:.
  // Unix: offer Computer whenever we are not already at `/`.
  const showRootsJump =
    !showingRoots && (platform === "win32" || !atFilesystemRoot);

  const showHomeJump =
    !showingRoots &&
    Boolean(homeDir) &&
    currentPath !== homeDir;

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
            {showingRoots ? rootsLabel : currentPath || "…"}
          </p>
          {error ? <p className="home-folder-picker-error">{error}</p> : null}
          <div className="home-folder-browser-list">
            {loading ? (
              <p className="home-folder-browser-empty">{t("common.loading")}</p>
            ) : (
              <ul>
                {showRootsJump ? (
                  <li>
                    <button
                      type="button"
                      className="home-folder-browser-item home-folder-browser-item--nav"
                      onClick={() => void loadPath(null, { roots: true })}
                    >
                      {rootsLabel}
                    </button>
                  </li>
                ) : null}
                {showHomeJump ? (
                  <li>
                    <button
                      type="button"
                      className="home-folder-browser-item home-folder-browser-item--nav"
                      onClick={() => void loadPath(homeDir)}
                    >
                      {t("settings.ai.aiEngine.folderHome", "Home")}
                    </button>
                  </li>
                ) : null}
                {parent && !showingRoots ? (
                  <li>
                    <button
                      type="button"
                      className="home-folder-browser-item home-folder-browser-item--nav"
                      onClick={() => void loadPath(parent)}
                    >
                      {t("settings.ai.aiEngine.folderParent", "↑ Parent folder")}
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
                    {t("settings.ai.aiEngine.folderEmpty")}
                  </li>
                ) : null}
              </ul>
            )}
          </div>
          <div className="modal-actions">
            <button type="button" className="secondary" onClick={onClose}>
              {t("common.cancel")}
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
