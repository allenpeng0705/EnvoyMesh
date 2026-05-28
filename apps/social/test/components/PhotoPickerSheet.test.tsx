/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PhotoPickerSheet } from "../../src/components/PhotoPickerSheet.js";

const loadImageFromFile = vi.fn();
const exportSquareThumbnail = vi.fn();

vi.mock("../../src/lib/profile-photo-crop.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/lib/profile-photo-crop.js")>();
  return {
    ...actual,
    loadImageFromFile: (...args: Parameters<typeof loadImageFromFile>) => loadImageFromFile(...args),
    exportSquareThumbnail: (...args: Parameters<typeof exportSquareThumbnail>) =>
      exportSquareThumbnail(...args),
  };
});

function mockImage(w = 400, h = 200): HTMLImageElement {
  const img = new Image();
  Object.defineProperty(img, "naturalWidth", { value: w, configurable: true });
  Object.defineProperty(img, "naturalHeight", { value: h, configurable: true });
  img.src = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  return img;
}

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  loadImageFromFile.mockResolvedValue(mockImage());
  exportSquareThumbnail.mockResolvedValue(new Blob([new Uint8Array([1])], { type: "image/png" }));
});

describe("PhotoPickerSheet", () => {
  it("does not crash when dragging after pointerup clears drag ref", async () => {
    const onConfirmThumbnail = vi.fn();
    render(
      <PhotoPickerSheet
        open
        purpose="thumbnail"
        onClose={() => {}}
        onConfirmThumbnail={onConfirmThumbnail}
        onConfirmGallery={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /choose photo/i }));
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File([new Uint8Array([137, 80, 78, 71])], "photo.png", { type: "image/png" });
    fireEvent.change(input, { target: { files: [file] } });

    const cropViewport = await screen.findByText(/drag the photo/i).then(() =>
      document.querySelector(".photo-crop-viewport"),
    );
    expect(cropViewport).toBeTruthy();

    fireEvent.pointerDown(cropViewport!, { clientX: 100, clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(cropViewport!, { clientX: 120, clientY: 110, pointerId: 1 });
    fireEvent.pointerUp(cropViewport!, { pointerId: 1 });
    // Move after up used to read dragRef.current.ox when null and crash the tree.
    fireEvent.pointerMove(cropViewport!, { clientX: 130, clientY: 120, pointerId: 1 });

    expect(screen.queryByText(/something went wrong/i)).toBeNull();
  });
});
