/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen, fireEvent } from "@testing-library/react";
import { ChatComposer } from "../../src/components/ChatComposer.js";
import { renderWithI18n } from "../helpers/render-with-i18n.js";

function renderComposer(overrides?: Partial<Parameters<typeof ChatComposer>[0]>) {
  const onChange = vi.fn();
  const onSend = vi.fn();
  renderWithI18n(
      <ChatComposer
        value=""
        onChange={onChange}
        onSend={onSend}
        sendLabel="Send"
        placeholder="Type a message"
        {...overrides}
      />,
  );
  return { onChange, onSend };
}

describe("ChatComposer", () => {
  afterEach(() => cleanup());
  it("renders emoji picker toggle and textarea", () => {
    renderComposer({ value: "hi" });
    expect(screen.getByLabelText(/open emoji picker/i)).toBeTruthy();
    expect(screen.getByPlaceholderText("Type a message")).toBeTruthy();
  });

  it("calls onSend on Enter without Shift", () => {
    const { onSend } = renderComposer({ value: "hello" });
    const field = screen.getByRole("textbox");
    fireEvent.keyDown(field, { key: "Enter", shiftKey: false });
    expect(onSend).toHaveBeenCalledTimes(1);
  });

  it("does not send on Shift+Enter", () => {
    const { onSend } = renderComposer({ value: "hello" });
    const field = screen.getByRole("textbox");
    fireEvent.keyDown(field, { key: "Enter", shiftKey: true });
    expect(onSend).not.toHaveBeenCalled();
  });
});
