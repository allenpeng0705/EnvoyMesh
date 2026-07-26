/**
 * @vitest-environment jsdom
 */
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { renderWithI18n } from "../helpers/render-with-i18n.js";
import { FeedMediaGrid, feedMediaGridClass } from "../../src/components/FeedMediaGrid.js";

vi.mock("../../src/lib/library-read-fetch.js", () => ({
  fetchLibraryContent: vi.fn(async () => ({ status: "error" })),
}));

describe("feedMediaGridClass", () => {
  it("maps counts to Moments layout classes and caps at 9", () => {
    expect(feedMediaGridClass(1)).toBe("feed-media feed-media--1");
    expect(feedMediaGridClass(4)).toBe("feed-media feed-media--4");
    expect(feedMediaGridClass(9)).toBe("feed-media feed-media--9");
    expect(feedMediaGridClass(12)).toBe("feed-media feed-media--9");
  });
});

describe("FeedMediaGrid", () => {
  afterEach(() => cleanup());

  it("renders at most 9 tiles and opens lightbox on click", () => {
    const urls = Array.from(
      { length: 11 },
      (_, i) => `envoy://envoy:owner:alice/feeds/media/p/img${i}.jpg`,
    );
    renderWithI18n(<FeedMediaGrid urls={urls} libraryRead={vi.fn()} />);
    const tiles = screen.getAllByTestId("feed-media-tile");
    expect(tiles).toHaveLength(9);
    expect(screen.getByTestId("feed-media-grid").getAttribute("data-count")).toBe("9");

    fireEvent.click(tiles[0]!);
    expect(screen.getByTestId("feed-media-lightbox")).toBeTruthy();
    expect(screen.getByText("1/9")).toBeTruthy();

    fireEvent.click(screen.getByLabelText("Next photo"));
    expect(screen.getByText("2/9")).toBeTruthy();

    fireEvent.click(screen.getByLabelText("Close"));
    expect(screen.queryByTestId("feed-media-lightbox")).toBeNull();
  });
});
