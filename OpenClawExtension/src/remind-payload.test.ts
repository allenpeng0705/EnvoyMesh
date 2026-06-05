import { describe, expect, it } from "vitest";
import {
  decodeEnvoymeshCronPayload,
  encodeEnvoymeshCronPayload,
  formatReminderDeliveryText,
} from "./remind-payload.js";

describe("envoymesh remind-payload", () => {
  it("round-trips cron reminder payloads", () => {
    const encoded = encodeEnvoymeshCronPayload({
      type: "cron_reminder",
      content: "drink water",
      targetAddress: "envoymesh:envoy:owner:test",
    });
    expect(encoded.startsWith("ENVOYMESH_CRON:")).toBe(true);
    const decoded = decodeEnvoymeshCronPayload(encoded);
    expect(decoded.payload?.content).toBe("drink water");
  });

  it("formats reminder delivery text once", () => {
    expect(formatReminderDeliveryText("drink water")).toBe("⏰ drink water");
    expect(formatReminderDeliveryText("⏰ drink water")).toBe("⏰ drink water");
  });
});
