/**
 * Playwright configuration for EnvoyMesh Phase 38 WebRTC E2E smoke tests.
 *
 * Uses Chromium in headless mode with fake media streams so
 * `getUserMedia({ audio: true })` returns a synthetic audio track
 * without requiring a real microphone.
 *
 * Usage:
 *   npx playwright test apps/social/test/e2e/webrtc-call.smoke.ts
 */

import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./apps/social/test/e2e",
  testMatch: "**/*.smoke.ts",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  retries: 0,
  workers: 2, // caller + callee contexts run in the same worker
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:5173",
    browserName: "chromium",
    headless: true,
    launchOptions: {
      args: [
        "--use-fake-device-for-media-stream",
        "--use-fake-ui-for-media-stream",
        "--no-sandbox",
        "--disable-setuid-sandbox",
      ],
    },
  },
});
