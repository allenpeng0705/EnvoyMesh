import { describe, expect, it } from "vitest";

import { terminalPathFromAttachWsUrl } from "../src/home-remote-client.js";

describe("terminalPathFromAttachWsUrl", () => {
  it("extracts path and query from loopback attach URL", () => {
    expect(
      terminalPathFromAttachWsUrl(
        "ws://127.0.0.1:3031/ws/terminal/abc-123?token=secret",
      ),
    ).toBe("/ws/terminal/abc-123?token=secret");
  });
});
