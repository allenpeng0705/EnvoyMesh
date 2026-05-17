/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { ThemeProvider, useTheme } from "../../src/context/ThemeContext.js";
import type { ThemeMode } from "../../src/context/ThemeContext.js";

afterEach(() => cleanup());

// Mock matchMedia — jsdom doesn't implement it
beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
});

// Helper component that renders the current theme
function ThemeConsumer() {
  const ctx = useTheme();
  return (
    <div>
      <span data-testid="theme">{ctx.theme}</span>
      <span data-testid="resolved">{ctx.resolved}</span>
      <button data-testid="set-light" onClick={() => ctx.setTheme("light")}>Light</button>
      <button data-testid="set-dark" onClick={() => ctx.setTheme("dark")}>Dark</button>
      <button data-testid="set-system" onClick={() => ctx.setTheme("system")}>System</button>
    </div>
  );
}

describe("ThemeContext", () => {
  it("provides default theme as system", () => {
    render(
      <ThemeProvider>
        <ThemeConsumer />
      </ThemeProvider>,
    );

    expect(screen.getByTestId("theme").textContent).toBe("system");
  });

  it("resolves system preference to light by default in jsdom", () => {
    render(
      <ThemeProvider>
        <ThemeConsumer />
      </ThemeProvider>,
    );

    expect(screen.getByTestId("resolved").textContent).toBe("light");
  });

  it("can set theme to dark", () => {
    render(
      <ThemeProvider>
        <ThemeConsumer />
      </ThemeProvider>,
    );

    fireEvent.click(screen.getByTestId("set-dark"));

    expect(screen.getByTestId("theme").textContent).toBe("dark");
    expect(screen.getByTestId("resolved").textContent).toBe("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("can set theme to light", () => {
    render(
      <ThemeProvider>
        <ThemeConsumer />
      </ThemeProvider>,
    );

    fireEvent.click(screen.getByTestId("set-light"));

    expect(screen.getByTestId("theme").textContent).toBe("light");
    expect(screen.getByTestId("resolved").textContent).toBe("light");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });

  it("can toggle back to system mode", () => {
    render(
      <ThemeProvider>
        <ThemeConsumer />
      </ThemeProvider>,
    );

    // Set to dark, then back to system
    fireEvent.click(screen.getByTestId("set-dark"));
    fireEvent.click(screen.getByTestId("set-system"));

    expect(screen.getByTestId("theme").textContent).toBe("system");
    // In jsdom, system resolves to light since no dark preference
    expect(screen.getByTestId("resolved").textContent).toBe("light");
  });

  it("persists theme to localStorage", () => {
    render(
      <ThemeProvider>
        <ThemeConsumer />
      </ThemeProvider>,
    );

    fireEvent.click(screen.getByTestId("set-dark"));
    expect(localStorage.getItem("envoy-theme")).toBe("dark");

    fireEvent.click(screen.getByTestId("set-light"));
    expect(localStorage.getItem("envoy-theme")).toBe("light");

    fireEvent.click(screen.getByTestId("set-system"));
    expect(localStorage.getItem("envoy-theme")).toBe("system");
  });

  it("restores theme from localStorage on mount", () => {
    localStorage.setItem("envoy-theme", "dark");

    render(
      <ThemeProvider>
        <ThemeConsumer />
      </ThemeProvider>,
    );

    expect(screen.getByTestId("theme").textContent).toBe("dark");
    expect(screen.getByTestId("resolved").textContent).toBe("dark");
  });

  it("applies data-theme attribute on <html>", () => {
    render(
      <ThemeProvider>
        <ThemeConsumer />
      </ThemeProvider>,
    );

    fireEvent.click(screen.getByTestId("set-dark"));
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");

    fireEvent.click(screen.getByTestId("set-light"));
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });

  it("throws when useTheme is used outside provider", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    function BadConsumer() {
      useTheme();
      return null;
    }

    expect(() => render(<BadConsumer />)).toThrow("useTheme() must be inside <ThemeProvider>");

    spy.mockRestore();
  });
});
