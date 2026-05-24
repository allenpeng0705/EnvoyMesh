/** @vitest-environment jsdom */

import { describe, expect, it, beforeEach } from "vitest";
import { loadMobileNodePrefs, saveMobileNodePrefs } from "../src/mobile-node-prefs.js";

describe("mobile-node-prefs", () => {
  const ownerId = "envoy:owner:test";

  beforeEach(() => {
    localStorage.clear();
  });

  it("round-trips aiSettings and autonomy prefs", () => {
    saveMobileNodePrefs(ownerId, {
      aiSettings: {
        status: { onlineAssistantEnabled: false, offlineAgentEnabled: true, statusMode: "manual" },
        identity: { mode: "transparent" },
        defaultModeForNewContacts: "assistant",
        rules: [],
      },
      autonomousKillSwitch: true,
      trustModeEnabled: true,
      friendMatchingPreferencesText: "likes hiking",
    });

    const loaded = loadMobileNodePrefs(ownerId);
    expect(loaded.aiSettings?.defaultModeForNewContacts).toBe("assistant");
    expect(loaded.autonomousKillSwitch).toBe(true);
    expect(loaded.trustModeEnabled).toBe(true);
    expect(loaded.friendMatchingPreferencesText).toBe("likes hiking");
  });

  it("round-trips contactAiPreferences", () => {
    saveMobileNodePrefs(ownerId, {
      contactAiPreferences: [
        {
          peerOwnerId: "envoy:owner:peer",
          aiAccessLevel: "assistant_only",
          knowledgeAccess: "public",
          priority: "high",
        },
      ],
    });
    const loaded = loadMobileNodePrefs(ownerId);
    expect(loaded.contactAiPreferences).toHaveLength(1);
    expect(loaded.contactAiPreferences[0]?.aiAccessLevel).toBe("assistant_only");
  });
});
