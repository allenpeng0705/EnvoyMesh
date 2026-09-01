import { describe, expect, it } from "vitest";
import { marketListingThumbStablePath } from "../src/web-content-author.js";

describe("marketListingThumbStablePath", () => {
  it("keeps thumbs under photos/market/ with safe id", () => {
    expect(marketListingThumbStablePath("listing_abc-1", "jpg")).toBe(
      "photos/market/listing_abc-1.jpg",
    );
    expect(marketListingThumbStablePath("../evil", "png")).toBe("photos/market/evil.png");
  });
});
