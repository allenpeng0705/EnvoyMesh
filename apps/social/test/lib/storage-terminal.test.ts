/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";

import {
  TERMINAL_NESTED_MULTIPLEXER_TIP_KEY,
  TERMINAL_SELECTED_SESSION_KEY,
  loadTerminalSelectedSessionId,
  saveTerminalSelectedSessionId,
} from "../../src/lib/storage.js";

describe("terminal storage helpers", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("persists and loads selected terminal session id", () => {
    expect(loadTerminalSelectedSessionId()).toBeNull();
    saveTerminalSelectedSessionId("sess-abc");
    expect(loadTerminalSelectedSessionId()).toBe("sess-abc");
    saveTerminalSelectedSessionId(null);
    expect(loadTerminalSelectedSessionId()).toBeNull();
  });

  it("uses stable keys for nested multiplexer tip dismissal", () => {
    expect(TERMINAL_SELECTED_SESSION_KEY).toContain("terminal");
    expect(TERMINAL_NESTED_MULTIPLEXER_TIP_KEY).toContain("nestedMultiplexer");
  });
});
