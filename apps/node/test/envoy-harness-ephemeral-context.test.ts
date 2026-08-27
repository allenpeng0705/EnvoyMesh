import { describe, expect, it } from "vitest";

import { ehMessagesToChatTurns } from "../src/envoy-harness-workspace.js";
import type { Message } from "@envoymesh/envoy-harness";

describe("ehMessagesToChatTurns", () => {
  it("skips persisted skill-catalog phantom user messages", () => {
    const messages: Message[] = [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "<available_skills><skill name=\"va-preview\">Preview…</skill></available_skills>",
          },
        ],
      },
      {
        role: "user",
        content: [{ type: "text", text: "review the agent loop" }],
      },
      {
        role: "assistant",
        content: [{ type: "text", text: "Here is a summary." }],
      },
    ];
    const turns = ehMessagesToChatTurns(messages);
    expect(turns).toHaveLength(2);
    expect(turns[0]?.role).toBe("user");
    expect(turns[0]?.text).toBe("review the agent loop");
    expect(turns[1]?.text).toBe("Here is a summary.");
  });
});
