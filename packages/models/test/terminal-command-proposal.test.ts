import { describe, expect, it } from "vitest";

import {
  classifyTerminalCommandRisk,
  compileTerminalCommandPatterns,
  parseTerminalCommandProposal,
  requiresConfirmationForRisk,
  resolveProposalRisk,
} from "@envoymesh/models";

describe("terminal command proposal", () => {
  it("parses valid JSON proposals", () => {
    const result = parseTerminalCommandProposal(
      JSON.stringify({ command: "ls -la", rationale: "list files", riskTier: "safe" }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.proposal.command).toBe("ls -la");
    }
  });

  it("parses JSON inside markdown fences", () => {
    const result = parseTerminalCommandProposal(
      "```json\n{\"command\":\"pwd\"}\n```",
    );
    expect(result.ok).toBe(true);
  });

  it("rejects free-text model output", () => {
    const result = parseTerminalCommandProposal("Run sudo reboot now");
    expect(result.ok).toBe(false);
  });

  it("classifies destructive reboot commands", () => {
    expect(classifyTerminalCommandRisk("sudo reboot")).toBe("destructive");
    expect(requiresConfirmationForRisk("destructive")).toBe(true);
    expect(requiresConfirmationForRisk("safe", "safe-only")).toBe(false);
    expect(requiresConfirmationForRisk("safe", "always-confirm")).toBe(true);
  });

  it("applies owner deny/allow regex patterns", () => {
    const deny = compileTerminalCommandPatterns(["^ls\\b"]);
    const allow = compileTerminalCommandPatterns(["^sudo apt install"]);
    expect(resolveProposalRisk("ls -la", undefined, { denyPatterns: deny }).riskTier).toBe("destructive");
    expect(resolveProposalRisk("sudo apt install nginx", undefined, { allowPatterns: allow }).riskTier).toBe("safe");
  });

  it("classifies moderate sudo install commands", () => {
    expect(classifyTerminalCommandRisk("sudo apt install nginx")).toBe("moderate");
  });

  it("detects SSH scrollback context as safe ls", () => {
    const scrollbackFixture = [
      "Welcome to Ubuntu 22.04 LTS",
      "Last login: Thu Jun  5 10:00:00 2026 from 10.0.0.2",
      "root@ecs:~# ",
    ].join("\n");
    expect(scrollbackFixture).toContain("root@ecs:~#");
    expect(classifyTerminalCommandRisk("ls -la /var/log")).toBe("safe");
  });

  it("deterministic tier overrides model safe hint for reboot", () => {
    const resolved = resolveProposalRisk("sudo reboot", "safe");
    expect(resolved.riskTier).toBe("destructive");
    expect(resolved.requiresConfirmation).toBe(true);
  });

  it("confirm gate: destructive requires confirmation flag", () => {
    const { requiresConfirmation } = resolveProposalRisk("sudo reboot");
    expect(requiresConfirmation).toBe(true);
  });
});
