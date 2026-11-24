import { describe, expect, it } from "vitest"

import {
  encodeEhMeshWorkRef,
  parseEhMeshWorkRef,
  EH_MESH_WORK_MARKER,
} from "../src/eh-mesh-work.js"

describe("eh-mesh-work (FH-P2-C)", () => {
  it("round-trips marker payload", () => {
    const line = encodeEhMeshWorkRef({
      kind: "eh-mesh-work",
      v: 1,
      workId: "w-1",
      prompt: "Fix the auth bug",
      fromOwnerId: "envoy:owner:abc",
      cwd: "/tmp/proj",
      title: "Auth fix",
    })
    expect(line.startsWith(EH_MESH_WORK_MARKER)).toBe(true)
    const parsed = parseEhMeshWorkRef(`Hello\n\n${line}`)
    expect(parsed?.workId).toBe("w-1")
    expect(parsed?.prompt).toBe("Fix the auth bug")
    expect(parsed?.cwd).toBe("/tmp/proj")
  })
})