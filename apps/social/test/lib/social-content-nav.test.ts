/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from "vitest";
import {
  clearSocialContentPeerFilter,
  openSocialContent,
  takePendingSocialContentPeer,
} from "../../src/lib/social-content-nav.js";

describe("social-content-nav", () => {
  afterEach(() => {
    clearSocialContentPeerFilter();
  });

  it("takePending consumes sessionStorage once", () => {
    openSocialContent("feed", "envoy:owner:bob");
    expect(takePendingSocialContentPeer()).toEqual({
      surface: "feed",
      ownerId: "envoy:owner:bob",
    });
    expect(takePendingSocialContentPeer()).toBeNull();
  });

  it("clearSocialContentPeerFilter drops pending peer so reload cannot resurrect it", () => {
    openSocialContent("blog", "envoy:owner:bob");
    clearSocialContentPeerFilter();
    expect(takePendingSocialContentPeer()).toBeNull();
  });
});
