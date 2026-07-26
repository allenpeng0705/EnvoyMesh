/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react"
import { NoteEditorView } from "../../src/components/views/NoteEditorView.js"

const createNote = vi.fn()
const readLibraryItemContent = vi.fn()

vi.mock("../../src/hooks/useNodeService.js", () => ({
  useNodeService: () => ({
    createNote,
    readLibraryItemContent,
  }),
}))

vi.mock("../../src/context/I18nContext.js", () => ({
  useT: () => (key: string, fallback?: string) => {
    const map: Record<string, string> = {
      "notes.newNote": "New File",
      "notes.editNote": "Edit File",
      "notes.lede": "Create a Markdown file in your vault.",
      "notes.errorFilename": "Please enter a filename",
      "notes.filenamePlaceholder": "My document",
      "notes.filenameAria": "Filename (.md added automatically)",
      "notes.subfolderPlaceholder": "Subfolder (optional)",
      "notes.sensitivityPublic": "Public",
      "notes.sensitivityFriends": "Friends",
      "notes.sensitivityPrivate": "Private",
      "notes.contentPlaceholder": "Write in Markdown…",
      "notes.saving": "Saving…",
      "common.cancel": "Cancel",
      "common.save": "Save",
    }
    return map[key] ?? fallback ?? key
  },
}))

describe("NoteEditorView", () => {
  beforeEach(() => {
    createNote.mockReset()
    readLibraryItemContent.mockReset()
    createNote.mockResolvedValue({ relativePath: "notes/hello.md" })
  })

  afterEach(() => {
    cleanup()
    document.body.innerHTML = ""
  })

  it("opens as a centered modal labeled New File with the markdown editor", () => {
    render(<NoteEditorView mode="create" onClose={() => {}} />)
    expect(screen.getByTestId("note-editor-modal")).toBeTruthy()
    expect(screen.getByRole("heading", { name: "New File" })).toBeTruthy()
    expect(screen.getByTestId("note-markdown-editor")).toBeTruthy()
    expect(screen.getByTestId("markdown-editor-textarea")).toBeTruthy()
  })

  it("creates a markdown file via createNote on save", async () => {
    const onSaved = vi.fn()
    render(<NoteEditorView mode="create" onClose={() => {}} onSaved={onSaved} />)

    fireEvent.change(screen.getByTestId("note-editor-filename"), {
      target: { value: "hello" },
    })
    fireEvent.change(screen.getByTestId("markdown-editor-textarea"), {
      target: { value: "# Hello" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Save" }))

    await waitFor(() => {
      expect(createNote).toHaveBeenCalledWith(
        expect.objectContaining({
          filename: "hello.md",
          content: "# Hello",
        }),
      )
      expect(onSaved).toHaveBeenCalledWith("notes/hello.md")
    })
  })

  it("appends .md automatically when the user omits the extension", async () => {
    render(<NoteEditorView mode="create" onClose={() => {}} />)
    fireEvent.change(screen.getByTestId("note-editor-filename"), {
      target: { value: "travel plans" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Save" }))
    await waitFor(() => {
      expect(createNote).toHaveBeenCalledWith(
        expect.objectContaining({ filename: "travel plans.md" }),
      )
    })
  })

  it("does not double-append when the user already typed .md", async () => {
    render(<NoteEditorView mode="create" onClose={() => {}} />)
    fireEvent.change(screen.getByTestId("note-editor-filename"), {
      target: { value: "hello.md" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Save" }))
    await waitFor(() => {
      expect(createNote).toHaveBeenCalledWith(
        expect.objectContaining({ filename: "hello.md" }),
      )
    })
  })
})
