/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  dismissNestedMultiplexerTip,
  isNestedMultiplexerTipDismissed,
  shouldShowNestedMultiplexerTip,
} from "../../src/lib/terminal-nested-multiplexer-tip.js";
import { TERMINAL_NESTED_MULTIPLEXER_TIP_KEY } from "../../src/lib/storage.js";

describe("terminal-nested-multiplexer-tip", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("detects tmux and tmuxai in terminal output", () => {
    expect(shouldShowNestedMultiplexerTip("starting tmux session")).toBe(true);
    expect(shouldShowNestedMultiplexerTip("run tmuxai attach")).toBe(true);
    expect(shouldShowNestedMultiplexerTip("npm test")).toBe(false);
  });

  it("respects dismissal flag in localStorage", () => {
    expect(shouldShowNestedMultiplexerTip("tmux")).toBe(true);
    dismissNestedMultiplexerTip();
    expect(isNestedMultiplexerTipDismissed()).toBe(true);
    expect(shouldShowNestedMultiplexerTip("tmux")).toBe(false);
  });

  it("uses stable storage key", () => {
    expect(TERMINAL_NESTED_MULTIPLEXER_TIP_KEY).toContain("nestedMultiplexer");
  });
});
