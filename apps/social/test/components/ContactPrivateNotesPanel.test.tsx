/** @vitest-environment jsdom */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ContactPrivateNotesPanel } from "../../src/components/ContactPrivateNotesPanel.js";

const sendSyncStateUpdate = vi.fn().mockResolvedValue({ ok: true, recipients: 0 });

vi.mock("../../src/hooks/useNodeService.js", () => ({
  useNodeService: () => ({
    sendSyncStateUpdate,
    on: vi.fn(() => () => {}),
  }),
}));

vi.mock("../../src/context/I18nContext.js", () => ({
  useT: () => (key: string) => key,
}));

describe("ContactPrivateNotesPanel", () => {
  it("renders private notes summary without a syncing indicator", () => {
    render(
      <ContactPrivateNotesPanel
        ownerId="envoy:owner:self"
        contactOwnerId="envoy:owner:peer"
        open
        onOpenChange={() => {}}
      />,
    );
    expect(screen.getByText("contactChat.privateNotesSummary")).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();
    expect(document.querySelector(".typing-indicator")).toBeNull();
  });
});
