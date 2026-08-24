/**
 * Shared draft attachments for EnvoyAI, Ext Agent, and Envoy Harness composers.
 */

import { useCallback, useRef, useState, type ChangeEvent } from "react"

import type {
  AgentAttachmentRef,
  UploadEnvoyAttachmentParams,
  UploadEnvoyAttachmentResult,
} from "@envoymesh/api"

import {
  assertAttachableFileSize,
  attachmentBasename,
  fileToBase64,
  guessMimeFromName,
  toAgentAttachmentRefs,
  type AgentDraftAttachment,
} from "../lib/agent-attachments.js"
import { isTauriShell, pickTauriFiles } from "../lib/tauri-shell.js"

function isUnderProject(path: string, projectCwd: string | undefined): boolean {
  if (!projectCwd?.trim()) return true
  const norm = (p: string) => p.replace(/\\/g, "/")
  const root = norm(projectCwd).replace(/\/$/, "")
  const abs = norm(path)
  return abs === root || abs.startsWith(`${root}/`)
}

function revokePreviews(attachments: AgentDraftAttachment[]): void {
  for (const att of attachments) {
    if (att.previewUrl) URL.revokeObjectURL(att.previewUrl)
  }
}

export interface UseAgentDraftAttachmentsOptions {
  /** When set, Tauri picks and browser uploads stay under this directory. */
  projectCwd?: string
  pickTitle?: string
  onError?: (message: string) => void
  uploadEnvoyAttachment: (
    params: UploadEnvoyAttachmentParams,
  ) => Promise<UploadEnvoyAttachmentResult>
}

export function useAgentDraftAttachments(options: UseAgentDraftAttachmentsOptions) {
  const [attachments, setAttachments] = useState<AgentDraftAttachment[]>([])
  const [busy, setBusy] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const optionsRef = useRef(options)
  optionsRef.current = options

  const addPaths = useCallback((paths: string[]) => {
    const projectCwd = optionsRef.current.projectCwd
    setAttachments((prev) => {
      const next = [...prev]
      for (const raw of paths) {
        const path = raw.trim()
        if (!path || !isUnderProject(path, projectCwd)) continue
        if (next.some((a) => a.path === path)) continue
        const name = attachmentBasename(path)
        next.push({
          id: crypto.randomUUID(),
          path,
          name,
          mimeType: guessMimeFromName(name),
        })
      }
      return next
    })
  }, [])

  const addUploadedFile = useCallback(
    (file: File, result: UploadEnvoyAttachmentResult) => {
      if (!result.ok || !result.path) return
      const projectCwd = optionsRef.current.projectCwd
      if (!isUnderProject(result.path, projectCwd)) {
        optionsRef.current.onError?.("Attachment must stay inside the project folder.")
        return
      }
      const previewUrl = file.type.startsWith("image/")
        ? URL.createObjectURL(file)
        : undefined
      setAttachments((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          path: result.path!,
          name: result.name ?? file.name,
          mimeType: result.mimeType ?? file.type,
          previewUrl,
        },
      ])
    },
    [],
  )

  const uploadBrowserFiles = useCallback(async (files: FileList | File[]) => {
    const list = Array.from(files)
    if (list.length === 0) return
    const projectCwd = optionsRef.current.projectCwd
    if (projectCwd !== undefined && projectCwd.trim().length === 0) {
      optionsRef.current.onError?.("Set a project folder before attaching files.")
      return
    }
    setBusy(true)
    try {
      for (const file of list) {
        const sizeErr = assertAttachableFileSize(file.size)
        if (sizeErr) {
          optionsRef.current.onError?.(`${file.name}: ${sizeErr}`)
          continue
        }
        const contentBase64 = await fileToBase64(file)
        const result = await optionsRef.current.uploadEnvoyAttachment({
          filename: file.name,
          mimeType: file.type || guessMimeFromName(file.name),
          contentBase64,
          ...(projectCwd?.trim() ? { targetDir: projectCwd.trim() } : {}),
        })
        if (!result.ok || !result.path) {
          optionsRef.current.onError?.(result.error ?? `Upload failed: ${file.name}`)
          continue
        }
        addUploadedFile(file, result)
      }
    } catch (err: unknown) {
      optionsRef.current.onError?.(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }, [addUploadedFile])

  const openPicker = useCallback(async () => {
    const { projectCwd, pickTitle, onError } = optionsRef.current
    if (projectCwd !== undefined && projectCwd.trim().length === 0) {
      onError?.("Set a project folder before attaching files.")
      return
    }
    if (isTauriShell()) {
      setBusy(true)
      try {
        const picked = await pickTauriFiles({
          title: pickTitle ?? "Attach files",
          ...(projectCwd?.trim() ? { defaultPath: projectCwd.trim() } : {}),
        })
        if (!picked.ok) {
          onError?.(picked.error)
          return
        }
        if (picked.paths?.length) addPaths(picked.paths)
      } finally {
        setBusy(false)
      }
      return
    }
    fileInputRef.current?.click()
  }, [addPaths])

  const handleFileInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files
      if (files?.length) void uploadBrowserFiles(files)
      event.target.value = ""
    },
    [uploadBrowserFiles],
  )

  const remove = useCallback((id: string) => {
    setAttachments((prev) => {
      const hit = prev.find((a) => a.id === id)
      if (hit?.previewUrl) URL.revokeObjectURL(hit.previewUrl)
      return prev.filter((a) => a.id !== id)
    })
  }, [])

  const clear = useCallback(() => {
    setAttachments((prev) => {
      revokePreviews(prev)
      return []
    })
  }, [])

  const replaceAttachments = useCallback((next: AgentDraftAttachment[]) => {
    setAttachments((prev) => {
      revokePreviews(prev)
      return next
    })
  }, [])

  const toRefs = useCallback((): AgentAttachmentRef[] => {
    return toAgentAttachmentRefs(attachments)
  }, [attachments])

  const pathList = attachments.map((a) => a.path)

  return {
    attachments,
    pathList,
    busy,
    fileInputRef,
    addPaths,
    uploadBrowserFiles,
    openPicker,
    handleFileInputChange,
    remove,
    clear,
    replaceAttachments,
    toRefs,
  }
}
