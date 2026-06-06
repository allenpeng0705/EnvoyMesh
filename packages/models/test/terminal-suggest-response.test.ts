import { describe, expect, it } from "vitest";

import { parseTerminalSuggestResponse } from "@envoymesh/models";

describe("terminal suggest response", () => {
  it("parses JSON suggestions", () => {
    const result = parseTerminalSuggestResponse(
      JSON.stringify({ completion: "systemctl status nginx", suggestions: ["systemctl status nginx"] }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.result.completion).toBe("systemctl status nginx");
    }
  });
});
