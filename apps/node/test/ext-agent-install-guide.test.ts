/**
 * Tests for the install guide factory + per-agent install command
 * table (Phase 55A.1).
 *
 * Strategy: pure table tests over `getExtAgentInstallGuide` for each
 * known agent id, plus default / unknown-id cases. No network or
 * child processes — the factory is pure data.
 */
import { describe, expect, it } from "vitest";
import {
  getExtAgentInstallGuide,
  type ExtAgentInstallGuide,
  type InstallState,
} from "@envoymesh/api";

describe("getExtAgentInstallGuide — known agents", () => {
  describe("codex", () => {
    it("not-installed: returns full install card with npm + verify + 3 issues", () => {
      const g: ExtAgentInstallGuide = getExtAgentInstallGuide("codex", "not-installed");
      expect(g.agentId).toBe("codex");
      expect(g.installed).toBe(false);
      expect(g.command).toBe("codex");
      expect(g.installCommand).toBe("npm install -g @openai/codex");
      expect(g.verifyCommand).toBe("codex --version");
      expect(g.homepageUrl).toBe("https://github.com/openai/codex");
      expect(g.homepageLabel).toBe("Codex on GitHub");
      expect(g.commonIssues.length).toBeGreaterThanOrEqual(2);
      // Must mention OPENAI_API_KEY — the #1 install-time gotcha
      expect(g.commonIssues.some((s) => s.includes("OPENAI_API_KEY"))).toBe(true);
    });

    it("installed: same card shape but installed=true and no installCommand needed", () => {
      const g = getExtAgentInstallGuide("codex", "installed");
      expect(g.installed).toBe(true);
      // installCommand is still present so UI can show a "reinstall" link
      expect(g.installCommand).toBe("npm install -g @openai/codex");
      expect(g.verifyCommand).toBe("codex --version");
    });
  });

  describe("claudecode", () => {
    it("not-installed: uses `claude` as the binary (not `claudecode`)", () => {
      const g = getExtAgentInstallGuide("claudecode", "not-installed");
      expect(g.agentId).toBe("claudecode");
      expect(g.installed).toBe(false);
      // binary is `claude`, not `claudecode` — verify the table got this right
      expect(g.command).toBe("claude");
      expect(g.installCommand).toBe("npm install -g @anthropic-ai/claude-code");
      expect(g.verifyCommand).toBe("claude --version");
      expect(g.homepageUrl).toBe("https://docs.claude.com/en/docs/claude-code");
      expect(g.commonIssues.some((s) => s.includes("ANTHROPIC_API_KEY"))).toBe(true);
    });
  });

  describe("hermes", () => {
    it("not-installed: curl-based install with API_SERVER hint", () => {
      const g = getExtAgentInstallGuide("hermes", "not-installed");
      expect(g.agentId).toBe("hermes");
      expect(g.installed).toBe(false);
      expect(g.command).toBe("hermes");
      expect(g.installCommand).toContain("curl");
      expect(g.installCommand).toContain("hermes-agent");
      expect(g.verifyCommand).toBe("hermes --version");
      expect(g.commonIssues.some((s) => s.includes("API_SERVER"))).toBe(true);
    });
  });

  describe("openhuman", () => {
    it("not-installed: curl-based install with token hint", () => {
      const g = getExtAgentInstallGuide("openhuman", "not-installed");
      expect(g.agentId).toBe("openhuman");
      expect(g.installed).toBe(false);
      expect(g.command).toBe("openhuman");
      expect(g.installCommand).toContain("curl");
      expect(g.installCommand).toContain("openhuman");
      expect(g.verifyCommand).toBe("openhuman --version");
      expect(g.commonIssues.some((s) => s.includes("OPENHUMAN_TOKEN") || s.includes("core.token"))).toBe(true);
    });
  });
});

describe("getExtAgentInstallGuide — built-in (Pi)", () => {
  it("pi is always installed: true with empty installCommand and no common issues", () => {
    const g = getExtAgentInstallGuide("pi", "installed");
    expect(g.agentId).toBe("pi");
    expect(g.installed).toBe(true);
    // Built-in — no install command
    expect(g.installCommand).toBe("");
    // Pi still has a homepage link
    expect(g.homepageUrl).toBe("https://github.com/earendil-works/pi");
    // No troubleshooting needed for a built-in
    expect(g.commonIssues).toEqual([]);
  });

  it("pi is installed regardless of the installState arg (built-in)", () => {
    const states: InstallState[] = ["installed", "not-installed", "unsupported", "unknown"];
    for (const s of states) {
      const g = getExtAgentInstallGuide("pi", s);
      expect(g.installed).toBe(true);
    }
  });
});

describe("getExtAgentInstallGuide — unknown / custom agent", () => {
  it("unknown id falls back to a generic row with no install recipe", () => {
    const g = getExtAgentInstallGuide("some-custom-agent-xyz", "not-installed");
    expect(g.agentId).toBe("some-custom-agent-xyz");
    expect(g.installed).toBe(false);
    // No install command bundled
    expect(g.installCommand).toBe("");
    // Common issues has the "no recipe" message
    expect(g.commonIssues.length).toBe(1);
    expect(g.commonIssues[0]).toMatch(/no install recipe/i);
  });

  it("default installState is 'unknown' when not specified", () => {
    const g = getExtAgentInstallGuide("codex");
    expect(g.installed).toBe(false);
  });

  it("empty / whitespace id is normalised to 'pi' (built-in default)", () => {
    const g = getExtAgentInstallGuide("", "installed");
    expect(g.agentId).toBe("pi");
    expect(g.installed).toBe(true);
    expect(g.installCommand).toBe("");
  });
});

describe("getExtAgentInstallGuide — common issues content", () => {
  it("codex issues mention OPENAI_API_KEY and Node.js version", () => {
    const g = getExtAgentInstallGuide("codex", "not-installed");
    const joined = g.commonIssues.join("\n");
    expect(joined).toMatch(/OPENAI_API_KEY/);
    expect(joined).toMatch(/Node\.js/);
  });

  it("claudecode issues mention ANTHROPIC_API_KEY", () => {
    const g = getExtAgentInstallGuide("claudecode", "not-installed");
    expect(g.commonIssues.join("\n")).toMatch(/ANTHROPIC_API_KEY/);
  });

  it("hermes issues mention API_SERVER env var and the local health port", () => {
    const g = getExtAgentInstallGuide("hermes", "not-installed");
    const joined = g.commonIssues.join("\n");
    expect(joined).toMatch(/API_SERVER/);
    expect(joined).toMatch(/8642/);
  });

  it("openhuman issues mention core.token and the local health port", () => {
    const g = getExtAgentInstallGuide("openhuman", "not-installed");
    const joined = g.commonIssues.join("\n");
    expect(joined).toMatch(/OPENHUMAN_TOKEN|core\.token/);
    expect(joined).toMatch(/7788/);
  });
});

describe("getExtAgentInstallGuide — per-state `installed` flag", () => {
  it("installed=true only when installState='installed'", () => {
    const states: Array<[InstallState, boolean]> = [
      ["installed", true],
      ["not-installed", false],
      ["unsupported", false],
      ["unknown", false],
    ];
    for (const [s, expected] of states) {
      const g = getExtAgentInstallGuide("codex", s);
      expect(g.installed).toBe(expected);
    }
  });
});
