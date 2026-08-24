/**
 * @vitest-environment jsdom
 */
import React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, screen } from "@testing-library/react"

import { EhComposerDockStack } from "../../src/components/ehui/EhComposerDockStack.js"
import { renderWithI18n } from "../helpers/render-with-i18n.js"

const ehRespondToPermission = vi.fn()

vi.mock("../../src/hooks/useNodeService.js", () => ({
  useNodeService: () => ({
    ehRespondToPermission,
    isConnected: true,
    on: () => () => {},
  }),
}))

afterEach(() => cleanup())

describe("EhComposerDockStack", () => {
  it("stacks permission dock, context, changes, queue, and composer slot", () => {
    const onQueueRemove = vi.fn()
  const onSelectFollowUp = vi.fn()

    renderWithI18n(
      <EhComposerDockStack
        permission={{
          requestId: "perm-stack",
          sessionId: "sess-1",
          toolName: "edit",
          description: "Edit file",
          args: {},
          preview: "diff preview",
          timeoutMs: 60_000,
        }}
        question={null}
        turnHints={{
          followUps: ["Add tests", "Run lint"],
        }}
        onSelectFollowUp={onSelectFollowUp}
        queue={[{ id: "q1", text: "queued prompt" }]}
        onQueueUpdate={() => {}}
        onQueueRemove={onQueueRemove}
        projectCwd="/projects/app"
        contextFiles={["src/index.ts"]}
        attachedPaths={["notes.md"]}
        onRemoveAttached={() => {}}
        changedFiles={["src/index.ts", "src/util.ts"]}
        onReviewChanges={() => {}}
        onDismissChanges={() => {}}
        composer={<div data-testid="composer-slot">composer</div>}
      />,
    )

    expect(screen.getByText("Edit file")).toBeDefined()
    expect(screen.getByText("index.ts")).toBeDefined()
    expect(screen.getByText(/2 file\(s\) changed/)).toBeDefined()
    expect(screen.getByText("Add tests")).toBeDefined()
    expect(screen.getByDisplayValue("queued prompt")).toBeDefined()
    expect(screen.getByTestId("composer-slot")).toBeDefined()

    fireEvent.click(screen.getByText("Add tests"))
    expect(onSelectFollowUp).toHaveBeenCalledWith("Add tests")

    fireEvent.click(screen.getAllByRole("button", { name: /Remove from queue/i })[0])
    expect(onQueueRemove).toHaveBeenCalledWith("q1")
  })
})
