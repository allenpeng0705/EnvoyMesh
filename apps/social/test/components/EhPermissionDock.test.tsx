/**
 * @vitest-environment jsdom
 */

import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";

import { EhPermissionDock } from "../../src/components/ehui/EhPermissionDock.js";
import { renderWithI18n } from "../helpers/render-with-i18n.js";

const ehRespondToPermission = vi.fn();

vi.mock("../../src/hooks/useNodeService.js", () => ({
  useNodeService: () => ({
    ehRespondToPermission,
    isConnected: true,
    on: () => () => {},
  }),
}));

beforeEach(() => {
  ehRespondToPermission.mockReset();
  ehRespondToPermission.mockResolvedValue({ requestId: "req-1", delivered: true });
});

afterEach(() => cleanup());

describe("EhPermissionDock", () => {
  it("renders tool name and preview, responds on Allow", async () => {
    const onResponded = vi.fn();
    renderWithI18n(
      <EhPermissionDock
        permission={{
          requestId: "req-1",
          sessionId: "sess-1",
          toolName: "bash",
          description: "Run npm test",
          args: { command: "npm test" },
          preview: "$ npm test",
          timeoutMs: 300_000,
        }}
        onResponded={onResponded}
      />,
    );

    expect(screen.getByText("bash")).toBeDefined();
    expect(screen.getByText("Run npm test")).toBeDefined();
    expect(screen.getByText("$ npm test")).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: /Allow/i }));
    await waitFor(() =>
      expect(ehRespondToPermission).toHaveBeenCalledWith({
        requestId: "req-1",
        allowed: true,
      }),
    );
    expect(onResponded).toHaveBeenCalledWith(true);
  });

  it("responds deny on Deny click", async () => {
    renderWithI18n(
      <EhPermissionDock
        permission={{
          requestId: "req-2",
          sessionId: "sess-1",
          toolName: "write",
          description: "Write file",
          args: {},
          timeoutMs: 300_000,
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Deny/i }));
    await waitFor(() =>
      expect(ehRespondToPermission).toHaveBeenCalledWith({
        requestId: "req-2",
        allowed: false,
      }),
    );
  });
});
