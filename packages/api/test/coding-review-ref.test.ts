import { describe, expect, it } from "vitest";
import {
  CODING_REVIEW_MARKER,
  CODING_REVIEW_REF_KIND,
  encodeCodingReviewRef,
  formatCodingReviewInviteMessage,
  parseCodingReviewRef,
  type CodingReviewRef,
} from "../src/coding-review-ref.js";

const base: CodingReviewRef = {
  kind: CODING_REVIEW_REF_KIND,
  v: 1,
  ownerId: "envoy:owner:alice",
  chatId: "chat-1",
  title: "Fix login",
  cwd: "/tmp/proj",
  turnId: "turn-9",
  revision: 3,
};

describe("coding-review-ref", () => {
  it("round-trips encode → parse", () => {
    const line = encodeCodingReviewRef(base);
    expect(line.startsWith(CODING_REVIEW_MARKER)).toBe(true);
    expect(parseCodingReviewRef(line)).toEqual(base);
  });

  it("parses marker from a multi-line chat body", () => {
    const msg = formatCodingReviewInviteMessage(base);
    expect(msg).toContain("I've invited you to review");
    expect(msg).toContain("Fix login");
    expect(parseCodingReviewRef(msg)).toEqual(base);
  });

  it("returns null for missing or invalid payloads", () => {
    expect(parseCodingReviewRef("")).toBeNull();
    expect(parseCodingReviewRef("hello")).toBeNull();
    expect(parseCodingReviewRef(`${CODING_REVIEW_MARKER}{not-json`)).toBeNull();
    expect(
      parseCodingReviewRef(
        `${CODING_REVIEW_MARKER}${JSON.stringify({ kind: "other", v: 1, ownerId: "a", chatId: "b" })}`,
      ),
    ).toBeNull();
    expect(
      parseCodingReviewRef(
        `${CODING_REVIEW_MARKER}${JSON.stringify({ kind: CODING_REVIEW_REF_KIND, v: 2, ownerId: "a", chatId: "b" })}`,
      ),
    ).toBeNull();
    expect(
      parseCodingReviewRef(
        `${CODING_REVIEW_MARKER}${JSON.stringify({ kind: CODING_REVIEW_REF_KIND, v: 1, ownerId: "", chatId: "b" })}`,
      ),
    ).toBeNull();
  });

  it("omits empty optional fields from encode", () => {
    const line = encodeCodingReviewRef({
      kind: CODING_REVIEW_REF_KIND,
      v: 1,
      ownerId: "envoy:owner:bob",
      chatId: "c2",
      title: "  ",
    });
    const parsed = parseCodingReviewRef(line);
    expect(parsed).toEqual({
      kind: CODING_REVIEW_REF_KIND,
      v: 1,
      ownerId: "envoy:owner:bob",
      chatId: "c2",
    });
  });
});
