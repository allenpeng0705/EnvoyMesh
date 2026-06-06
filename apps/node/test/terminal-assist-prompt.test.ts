import { describe, expect, it } from "vitest";

import { detectShellContext, scrubTerminalScrollback, squashTerminalTurnHistory } from "../src/terminal-assist-prompt.js";

describe("terminal assist prompt", () => {
  it("scrubs ANSI and preserves SSH prompt tail", () => {
    const raw = "\x1b[31mroot@ecs:~#\x1b[0m ls\n";
    const scrubbed = scrubTerminalScrollback(raw);
    expect(scrubbed).toContain("root@ecs:~#");
    expect(scrubbed).not.toContain("\x1b");
  });

  it("detects likely remote SSH from scrollback fixture", () => {
    const fixture = "Welcome\nroot@ecs:~# systemctl status nginx";
    const ctx = detectShellContext(fixture);
    expect(ctx.likelyRemoteSsh).toBe(true);
    expect(ctx.promptHint).toContain("root@ecs");
  });

  it("squashes long turn history", () => {
    const turns = Array.from({ length: 10 }, (_, i) => ({
      role: i % 2 === 0 ? "user" : "assistant",
      text: `turn-${i}-${"x".repeat(800)}`,
    }));
    const squashed = squashTerminalTurnHistory(turns);
    expect(squashed).toContain("omitted");
    expect(squashed.length).toBeLessThanOrEqual(4000);
  });
});
