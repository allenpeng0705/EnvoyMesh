/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { ErrorBoundary } from "../../src/components/ErrorBoundary.js";

afterEach(() => cleanup());

function Bomb({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) throw new Error("Test explosion");
  return <p>All good</p>;
}

describe("ErrorBoundary", () => {
  it("renders children when there is no error", () => {
    render(
      <ErrorBoundary>
        <Bomb shouldThrow={false} />
      </ErrorBoundary>,
    );
    expect(screen.getByText("All good")).toBeDefined();
  });

  it("catches errors and shows fallback UI", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <Bomb shouldThrow={true} />
      </ErrorBoundary>,
    );

    expect(screen.getByText("Something went wrong")).toBeDefined();
    expect(screen.getByText("Test explosion")).toBeDefined();
    expect(screen.getByText("Try Again")).toBeDefined();

    spy.mockRestore();
  });

  it("renders custom fallback when provided", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <ErrorBoundary fallback={<div>Custom fallback</div>}>
        <Bomb shouldThrow={true} />
      </ErrorBoundary>,
    );

    expect(screen.getByText("Custom fallback")).toBeDefined();

    spy.mockRestore();
  });

  it("offers Reload for missing-provider context errors", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const reload = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...window.location, reload },
    });

    function ProviderBomb(): null {
      throw new Error("useNodeState must be used within NodeStateProvider");
    }

    render(
      <ErrorBoundary>
        <ProviderBomb />
      </ErrorBoundary>,
    );

    expect(screen.getByText(/lost its session state/i)).toBeDefined();
    fireEvent.click(screen.getByText("Reload"));
    expect(reload).toHaveBeenCalled();

    spy.mockRestore();
  });
});
