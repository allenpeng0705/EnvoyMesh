import { describe, expect, it } from "vitest";

import { evaluateSemanticFirewall } from "@envoymesh/models";
import { buildTerminalAssistPrompt, scrubTerminalScrollback } from "../src/terminal-assist-prompt.js";

describe("terminal assist prompt firewall", () => {
  it("flags raw PTY scrollback with bell characters", () => {
    const dirty = "user@host\x07$ ls\nfile\n";
    expect(evaluateSemanticFirewall({ text: dirty }).ok).toBe(false);
  });

  it("accepts scrubbed scrollback and full assist prompts", () => {
    const dirty = "user@host\x07$ ls\nfile\n";
    const scrubbed = scrubTerminalScrollback(dirty);
    expect(evaluateSemanticFirewall({ text: scrubbed }).ok).toBe(true);

    const prompt = buildTerminalAssistPrompt({
      scrollback: dirty,
      userPrompt: "hello",
      cwd: "/tmp",
      shell: "zsh",
    });
    expect(evaluateSemanticFirewall({ text: prompt }).ok).toBe(true);
  });
});
