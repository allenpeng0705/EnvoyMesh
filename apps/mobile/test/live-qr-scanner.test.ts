import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const VALID_URI =
  "envoy://pair?wsUrl=ws%3A%2F%2Frelay.example%3A9000&token=tok123&ownerPublicKey=-----BEGIN%20PUBLIC%20KEY-----&ownerId=envoy%3Aowner%3Aabc&agentPeerId=envoy_agent_x&agentName=HomeClaw&homeNodePeerId=home-peer";

type ScanImpl = () => Promise<{ ScanResult: string; format: number }>;

interface MockState {
  isNative: boolean;
  scanImpl: ScanImpl;
}

function installMocks(state: MockState) {
  vi.doMock("@capacitor/core", () => ({
    Capacitor: { isNativePlatform: () => state.isNative },
  }));
  vi.doMock("@capacitor/barcode-scanner", () => ({
    CapacitorBarcodeScanner: { scanBarcode: state.scanImpl },
    CapacitorBarcodeScannerCameraDirection: { BACK: 1, FRONT: 2 },
    CapacitorBarcodeScannerTypeHint: { QR_CODE: 0 },
  }));
}

async function loadModule() {
  vi.resetModules();
  return import("../src/lib/live-qr-scanner.js");
}

afterEach(() => {
  vi.doUnmock("@capacitor/core");
  vi.doUnmock("@capacitor/barcode-scanner");
  vi.resetModules();
});

describe("scanEnvoyPairUriLive (web)", () => {
  it("reports unsupported when not on a native platform", async () => {
    installMocks({ isNative: false, scanImpl: async () => ({ ScanResult: VALID_URI, format: 0 }) });
    const mod = await loadModule();
    const result = await mod.scanEnvoyPairUriLive();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("unsupported");
  });
});

describe("scanEnvoyPairUriLive (native)", () => {
  let state: MockState;

  beforeEach(() => {
    state = {
      isNative: true,
      scanImpl: async () => ({ ScanResult: VALID_URI, format: 0 }),
    };
    installMocks(state);
  });

  it("returns ok with a valid envoy://pair URI", async () => {
    const mod = await loadModule();
    const result = await mod.scanEnvoyPairUriLive({ instructions: "hello" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.uri).toBe(VALID_URI);
    expect(mod.isNativeBarcodeScannerAvailable()).toBe(true);
  });

  it("reports userCancelled when scan returns empty result", async () => {
    state.scanImpl = async () => ({ ScanResult: "", format: 0 });
    const mod = await loadModule();
    const result = await mod.scanEnvoyPairUriLive();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("userCancelled");
  });

  it("reports scanFailed when result is not a valid pair URI", async () => {
    state.scanImpl = async () => ({ ScanResult: "https://example.com", format: 0 });
    const mod = await loadModule();
    const result = await mod.scanEnvoyPairUriLive();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("scanFailed");
      expect(result.error).toBeDefined();
    }
  });

  it("reports permissionDenied when native throws a permission error", async () => {
    state.scanImpl = async () => {
      throw new Error("Camera permission not granted");
    };
    const mod = await loadModule();
    const result = await mod.scanEnvoyPairUriLive();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("permissionDenied");
  });

  it("reports userCancelled when native throws a cancel error", async () => {
    state.scanImpl = async () => {
      throw new Error("User cancelled scan");
    };
    const mod = await loadModule();
    const result = await mod.scanEnvoyPairUriLive();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("userCancelled");
  });

  it("reports scanFailed on an unrelated error", async () => {
    state.scanImpl = async () => {
      throw new Error("decoder fault");
    };
    const mod = await loadModule();
    const result = await mod.scanEnvoyPairUriLive();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("scanFailed");
  });
});
