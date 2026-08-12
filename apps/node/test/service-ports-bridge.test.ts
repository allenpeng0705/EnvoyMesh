import { afterEach, describe, expect, it } from "vitest"
import { effectiveBridgeListenPort } from "../src/service-ports.js"

describe("effectiveBridgeListenPort", () => {
  const prevBridge = process.env.ENVOYMESH_BRIDGE_PORT
  const prevOffset = process.env.ENVOYMESH_PORT_OFFSET

  afterEach(() => {
    if (prevBridge === undefined) delete process.env.ENVOYMESH_BRIDGE_PORT
    else process.env.ENVOYMESH_BRIDGE_PORT = prevBridge
    if (prevOffset === undefined) delete process.env.ENVOYMESH_PORT_OFFSET
    else process.env.ENVOYMESH_PORT_OFFSET = prevOffset
  })

  it("honors configured listenPort when no env override", () => {
    delete process.env.ENVOYMESH_BRIDGE_PORT
    delete process.env.ENVOYMESH_PORT_OFFSET
    expect(effectiveBridgeListenPort(3040)).toBe(3040)
  })

  it("prefers ENVOYMESH_BRIDGE_PORT over stale bridge-config.json", () => {
    delete process.env.ENVOYMESH_PORT_OFFSET
    process.env.ENVOYMESH_BRIDGE_PORT = "4031"
    expect(effectiveBridgeListenPort(3031)).toBe(4031)
  })
})
