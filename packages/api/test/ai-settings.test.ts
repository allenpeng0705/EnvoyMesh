import { describe, expect, it } from "vitest";
import { normalizeAiSettings } from "../src/ai-settings.js";

describe("normalizeAiSettings", () => {
  it("fills identity and status when only knowledgeBase is persisted", () => {
    const normalized = normalizeAiSettings({
      knowledgeBase: { enabled: true },
    } as never);
    expect(normalized.identity.mode).toBe("transparent");
    expect(normalized.status.onlineAssistantEnabled).toBe(true);
    expect(normalized.status.offlineAgentEnabled).toBe(false);
    expect(normalized.defaultModeForNewContacts).toBe("manual");
    expect(normalized.knowledgeBase?.enabled).toBe(true);
  });

  it("preserves explicit identity mode", () => {
    const normalized = normalizeAiSettings({
      identity: { mode: "defensive" },
      status: {
        onlineAssistantEnabled: false,
        offlineAgentEnabled: true,
        statusMode: "manual",
      },
      defaultModeForNewContacts: "auto",
      rules: [],
    });
    expect(normalized.identity.mode).toBe("defensive");
    expect(normalized.status.offlineAgentEnabled).toBe(true);
    expect(normalized.defaultModeForNewContacts).toBe("auto");
  });
});
