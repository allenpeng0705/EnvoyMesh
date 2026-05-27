import { describe, expect, it } from "vitest";
import { pinCidToProvider } from "../src/ipfs-pinning.js";

describe("pinCidToProvider", () => {
  it("returns not configured when Pinata JWT env is missing", async () => {
    const prev = process.env.ENVOYMESH_PINATA_JWT;
    delete process.env.ENVOYMESH_PINATA_JWT;
    const result = await pinCidToProvider({ cid: "bafytest" });
    if (prev !== undefined) process.env.ENVOYMESH_PINATA_JWT = prev;
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/not configured/i);
    }
  });
});
