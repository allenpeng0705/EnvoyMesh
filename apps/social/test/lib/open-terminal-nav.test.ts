/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from "vitest";
import { OPEN_CODING_EVENT } from "../../src/lib/open-coding-nav.js";
import {
  OPEN_TERMINAL_EVENT,
  openTerminal,
} from "../../src/lib/open-terminal-nav.js";

describe("openTerminal", () => {
  afterEach(() => {
    // Drain any pending listeners by cloning handlers off — tests add their own.
  });

  it("redirects startPi to open-coding with harness pi", () => {
    const events: CustomEvent[] = [];
    const onCoding = (ev: Event) => {
      events.push(ev as CustomEvent);
    };
    window.addEventListener(OPEN_CODING_EVENT, onCoding);
    try {
      openTerminal({ startPi: true, startNew: true });
      expect(events).toHaveLength(1);
      expect(events[0]?.detail).toEqual({
        harness: "pi",
        startNew: true,
      });
    } finally {
      window.removeEventListener(OPEN_CODING_EVENT, onCoding);
    }
  });

  it("dispatches open-terminal when not starting Pi", () => {
    const coding: CustomEvent[] = [];
    const terminal: CustomEvent[] = [];
    const onCoding = (ev: Event) => {
      coding.push(ev as CustomEvent);
    };
    const onTerminal = (ev: Event) => {
      terminal.push(ev as CustomEvent);
    };
    window.addEventListener(OPEN_CODING_EVENT, onCoding);
    window.addEventListener(OPEN_TERMINAL_EVENT, onTerminal);
    try {
      openTerminal({});
      expect(coding).toHaveLength(0);
      expect(terminal).toHaveLength(1);
    } finally {
      window.removeEventListener(OPEN_CODING_EVENT, onCoding);
      window.removeEventListener(OPEN_TERMINAL_EVENT, onTerminal);
    }
  });
});
