/**
 * ThemeContext — System / Light / Dark theme toggle.
 *
 * Stores preference in localStorage (key: envoy-theme).
 * Applies data-theme attribute on <html> for CSS token overrides.
 */
import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";

export type ThemeMode = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

interface ThemeContextValue {
  theme: ThemeMode;
  resolved: ResolvedTheme;
  setTheme: (t: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const STORAGE_KEY = "envoy-theme";

function getStoredTheme(): ThemeMode {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === "light" || raw === "dark" || raw === "system") return raw;
  } catch { /* localStorage unavailable */ }
  return "system";
}

function setStoredTheme(t: ThemeMode): void {
  try {
    localStorage.setItem(STORAGE_KEY, t);
  } catch { /* ignore */ }
}

function resolveTheme(theme: ThemeMode): ResolvedTheme {
  if (theme === "light" || theme === "dark") return theme;
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(resolved: ResolvedTheme): void {
  document.documentElement.setAttribute("data-theme", resolved);
  // Update theme-color meta
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute("content", resolved === "dark" ? "#1e293b" : "#f1f5f9");
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, _setTheme] = useState<ThemeMode>(getStoredTheme);
  const [resolved, setResolved] = useState<ResolvedTheme>(() => resolveTheme(getStoredTheme()));

  const setTheme = useCallback((t: ThemeMode) => {
    _setTheme(t);
    setStoredTheme(t);
    const r = resolveTheme(t);
    setResolved(r);
    applyTheme(r);
  }, []);

  // Apply on mount
  useEffect(() => {
    const r = resolveTheme(theme);
    setResolved(r);
    applyTheme(r);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Listen for system changes when in "system" mode
  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    function onChange() {
      const r = resolveTheme("system");
      setResolved(r);
      applyTheme(r);
    }
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, resolved, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme() must be inside <ThemeProvider>");
  return ctx;
}
