/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { cleanup, screen, waitFor } from "@testing-library/react";
import { KnowledgeIndexChip } from "../../src/components/views/KnowledgeIndexChip.js";
import { renderWithI18n } from "../helpers/render-with-i18n.js";

const getRagIndexStatus = vi.fn();
const on = vi.fn(() => () => {});

vi.mock("../../src/hooks/useNodeService.js", () => ({
  useNodeService: () => ({
    getRagIndexStatus,
    on,
  }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

beforeEach(() => {
  getRagIndexStatus.mockResolvedValue({
    isIndexing: false,
    progress: {
      phase: "idle",
      processed: 0,
      total: 0,
      indexed: 0,
      skipped: 0,
      removed: 0,
      updatedAt: new Date(0).toISOString(),
    },
    trackedDocuments: 7,
  });
});

describe("KnowledgeIndexChip", () => {
  it("shows tracked document count", async () => {
    renderWithI18n(<KnowledgeIndexChip />);
    await waitFor(() => {
      expect(screen.getByTestId("knowledge-index-chip").textContent).toMatch(/7/);
    });
  });
});
