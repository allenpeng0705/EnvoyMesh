/**
 * @vitest-environment jsdom
 */
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { EhUserQuestionDock } from "../../src/components/ehui/EhUserQuestionDock.js";
import { renderWithI18n } from "../helpers/render-with-i18n.js";
import { partialNodeService } from "../helpers/node-service-mock.js";

const respond = vi.fn().mockResolvedValue(undefined);

vi.mock("../../src/hooks/useNodeService.js", () => ({
  useNodeService: () => partialNodeService({
    ehRespondToUserQuestion: (...args: unknown[]) => respond(...args),
  }),
}));

const question = {
  requestId: "q1",
  prompt: "Which files?",
  options: ["a.ts", "b.ts"],
  timeoutMs: 60_000,
  kind: "ask" as const,
};

describe("EhUserQuestionDock", () => {
  afterEach(() => {
    cleanup();
    respond.mockClear();
  });

  it("sends one choice immediately", () => {
    renderWithI18n(<EhUserQuestionDock question={question} />);
    fireEvent.click(screen.getByTestId("eh-question-option-1"));
    expect(respond).toHaveBeenCalledWith({
      requestId: "q1",
      value: "b.ts",
      optionIndex: 1,
    });
  });

  it("waits for Confirm on a multi-select question", () => {
    renderWithI18n(
      <EhUserQuestionDock question={{ ...question, multiple: true }} />,
    );
    fireEvent.click(screen.getByTestId("eh-question-option-0"));
    fireEvent.click(screen.getByTestId("eh-question-option-1"));
    expect(respond).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("eh-question-confirm"));
    expect(respond).toHaveBeenCalledWith({
      requestId: "q1",
      value: "a.ts, b.ts",
      optionIndexes: [0, 1],
    });
  });

  it("sends a typed answer when the agent did not offer choices", () => {
    renderWithI18n(
      <EhUserQuestionDock
        question={{ ...question, options: [], multiline: true }}
      />,
    );
    fireEvent.change(screen.getByTestId("eh-question-text"), {
      target: { value: "use the small one" },
    });
    fireEvent.click(screen.getByTestId("eh-question-confirm"));
    expect(respond).toHaveBeenCalledWith({
      requestId: "q1",
      value: "use the small one",
    });
  });
});
