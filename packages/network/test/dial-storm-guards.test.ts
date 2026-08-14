import { describe, expect, it } from "vitest";
import {
  DEFAULT_CLIENT_MAX_DIAL_QUEUE_LENGTH,
  DEFAULT_CLIENT_MAX_PARALLEL_DIALS,
  DEFAULT_CLIENT_MAX_PEER_ADDRS_TO_DIAL,
  DHT_PROVIDE_DIAL_QUEUE_DEFER_THRESHOLD,
  ENSURE_PEER_DIAL_QUEUE_DEFER_THRESHOLD,
  isDialQueueLengthCongested,
  shouldDeferEnsurePeerForDialQueue,
} from "../src/index.js";

describe("dial storm guards", () => {
  it("caps home-node dial parallelism well below libp2p defaults", () => {
    expect(DEFAULT_CLIENT_MAX_PARALLEL_DIALS).toBeLessThan(50);
    expect(DEFAULT_CLIENT_MAX_DIAL_QUEUE_LENGTH).toBeLessThan(200);
    expect(DEFAULT_CLIENT_MAX_PEER_ADDRS_TO_DIAL).toBeLessThan(25);
  });

  it("defers speculative ensurePeerReachable when dialQueue is flooded", () => {
    expect(
      shouldDeferEnsurePeerForDialQueue({
        dialQueueLength: ENSURE_PEER_DIAL_QUEUE_DEFER_THRESHOLD + 1,
      }),
    ).toBe(true);
    expect(
      shouldDeferEnsurePeerForDialQueue({
        dialQueueLength: ENSURE_PEER_DIAL_QUEUE_DEFER_THRESHOLD,
      }),
    ).toBe(false);
  });

  it("bonded priorityDial and forceFreshDial bypass dialQueue deferral", () => {
    expect(
      shouldDeferEnsurePeerForDialQueue({
        dialQueueLength: 500,
        priorityDial: true,
      }),
    ).toBe(false);
    expect(
      shouldDeferEnsurePeerForDialQueue({
        dialQueueLength: 500,
        forceFreshDial: true,
      }),
    ).toBe(false);
  });

  it("marks DHT provide congested above the provide threshold", () => {
    expect(isDialQueueLengthCongested(DHT_PROVIDE_DIAL_QUEUE_DEFER_THRESHOLD)).toBe(false);
    expect(isDialQueueLengthCongested(DHT_PROVIDE_DIAL_QUEUE_DEFER_THRESHOLD + 1)).toBe(true);
    expect(isDialQueueLengthCongested(undefined)).toBe(false);
  });
});
