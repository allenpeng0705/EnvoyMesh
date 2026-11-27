import { describe, expect, it } from "vitest";
import {
  TAURI_RECOVERY_AFTER_MS,
  WS_OFFLINE_GRACE_MS,
  shouldArmTauriOfflineRecovery,
  shouldShowFullConnectingSplash,
  shouldShowReconnectGraceBanner,
  tauriRecoveryDueInMs,
} from "../../src/lib/ws-reconnect-policy.js";

describe("shouldShowFullConnectingSplash", () => {
  it("hides splash while connected", () => {
    expect(
      shouldShowFullConnectingSplash({
        isConnected: true,
        hadConnected: true,
        offlineMs: 60_000,
      }),
    ).toBe(false);
  });

  it("shows splash immediately before the first successful connect", () => {
    expect(
      shouldShowFullConnectingSplash({
        isConnected: false,
        hadConnected: false,
        offlineMs: 0,
      }),
    ).toBe(true);
  });

  it("keeps the shell during the grace window after a prior connect", () => {
    expect(
      shouldShowFullConnectingSplash({
        isConnected: false,
        hadConnected: true,
        offlineMs: WS_OFFLINE_GRACE_MS - 1,
      }),
    ).toBe(false);
  });

  it("shows splash once grace expires", () => {
    expect(
      shouldShowFullConnectingSplash({
        isConnected: false,
        hadConnected: true,
        offlineMs: WS_OFFLINE_GRACE_MS,
      }),
    ).toBe(true);
  });
});

describe("shouldShowReconnectGraceBanner", () => {
  it("is only true during the post-connect grace window", () => {
    expect(
      shouldShowReconnectGraceBanner({
        isConnected: false,
        hadConnected: true,
        offlineMs: 1_000,
      }),
    ).toBe(true);
    expect(
      shouldShowReconnectGraceBanner({
        isConnected: false,
        hadConnected: false,
        offlineMs: 1_000,
      }),
    ).toBe(false);
    expect(
      shouldShowReconnectGraceBanner({
        isConnected: true,
        hadConnected: true,
        offlineMs: 1_000,
      }),
    ).toBe(false);
    expect(
      shouldShowReconnectGraceBanner({
        isConnected: false,
        hadConnected: true,
        offlineMs: WS_OFFLINE_GRACE_MS,
      }),
    ).toBe(false);
  });
});

describe("shouldArmTauriOfflineRecovery", () => {
  it("arms only for Tauri after a prior connect and long outage", () => {
    expect(
      shouldArmTauriOfflineRecovery({
        tauriShell: true,
        isConnected: false,
        hadConnected: true,
        offlineMs: TAURI_RECOVERY_AFTER_MS,
        alreadyAttempted: false,
      }),
    ).toBe(true);
  });

  it("does not arm for browser, first launch, connected, or repeat attempts", () => {
    expect(
      shouldArmTauriOfflineRecovery({
        tauriShell: false,
        isConnected: false,
        hadConnected: true,
        offlineMs: TAURI_RECOVERY_AFTER_MS,
        alreadyAttempted: false,
      }),
    ).toBe(false);
    expect(
      shouldArmTauriOfflineRecovery({
        tauriShell: true,
        isConnected: false,
        hadConnected: false,
        offlineMs: TAURI_RECOVERY_AFTER_MS,
        alreadyAttempted: false,
      }),
    ).toBe(false);
    expect(
      shouldArmTauriOfflineRecovery({
        tauriShell: true,
        isConnected: true,
        hadConnected: true,
        offlineMs: TAURI_RECOVERY_AFTER_MS,
        alreadyAttempted: false,
      }),
    ).toBe(false);
    expect(
      shouldArmTauriOfflineRecovery({
        tauriShell: true,
        isConnected: false,
        hadConnected: true,
        offlineMs: TAURI_RECOVERY_AFTER_MS,
        alreadyAttempted: true,
      }),
    ).toBe(false);
    expect(
      shouldArmTauriOfflineRecovery({
        tauriShell: true,
        isConnected: false,
        hadConnected: true,
        offlineMs: TAURI_RECOVERY_AFTER_MS - 1,
        alreadyAttempted: false,
      }),
    ).toBe(false);
  });
});

describe("tauriRecoveryDueInMs", () => {
  it("returns null when recovery should not be scheduled", () => {
    expect(
      tauriRecoveryDueInMs({
        tauriShell: true,
        isConnected: true,
        hadConnected: true,
        offlineSince: 1,
        alreadyAttempted: false,
      }),
    ).toBeNull();
    expect(
      tauriRecoveryDueInMs({
        tauriShell: true,
        isConnected: false,
        hadConnected: true,
        offlineSince: null,
        alreadyAttempted: false,
      }),
    ).toBeNull();
  });

  it("returns remaining ms until the recovery threshold", () => {
    const offlineSince = 1_000_000;
    expect(
      tauriRecoveryDueInMs({
        tauriShell: true,
        isConnected: false,
        hadConnected: true,
        offlineSince,
        alreadyAttempted: false,
        nowMs: offlineSince + 10_000,
      }),
    ).toBe(TAURI_RECOVERY_AFTER_MS - 10_000);
  });

  it("returns 0 when already past the threshold", () => {
    const offlineSince = 1_000_000;
    expect(
      tauriRecoveryDueInMs({
        tauriShell: true,
        isConnected: false,
        hadConnected: true,
        offlineSince,
        alreadyAttempted: false,
        nowMs: offlineSince + TAURI_RECOVERY_AFTER_MS + 5_000,
      }),
    ).toBe(0);
  });
});
