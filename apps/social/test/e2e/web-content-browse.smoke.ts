/**
 * Phase 45 Web Content Browsing E2E smoke test (Playwright).
 *
 * Spawns two real EnvoyMesh node OS processes via NodeSpawner
 * (Alice serving content, Bob fetching), opens the Social UI in
 * Chromium pointed at Bob's Social WS, and verifies the Browser view:
 *
 *   1. Fetch markdown → renders heading text
 *   2. Fetch image → renders <img> with blob: src
 *   3. Fetch PDF → renders in <iframe>
 *   4. Stranger denied (unbonded Bob) → error region
 *   5. Bonded allowed → content served
 *   6. Back button navigates to previous page
 *   7. Malformed envoy:// URL → parse error
 *   8. Bookmark star toggles persistence (★ / ☆)
 *   9. Contacts ACL deny (bonded, not listed) → access denied
 *  10. Contacts ACL allow (bonded + listed) → content served
 *
 * Prerequisites:
 *   - npm install
 *   - npx playwright install chromium
 *   - Pre-built Social UI at apps/social/dist
 *
 * Run: bash scripts/smoke-web-content.sh  |  npm run smoke:web-content
 *
 * Design: docs/web-content-browsing-design.md §8.4
 */

import { test, expect, type Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { NodeSpawner } from "./helpers/node-spawner.js";
import { SocialPage } from "./helpers/social-page.js";

interface TestFixtures {
  spawner: NodeSpawner;
  aliceOwnerId: string;
  helloUrl: () => string;
  social: SocialPage;
  cleanup: () => Promise<void>;
}

async function writeHumanProfile(profileDir: string, ownerId: string, displayName: string): Promise<void> {
  await writeFile(
    join(profileDir, "human-profile.json"),
    JSON.stringify(
      {
        version: "0.1",
        ownerId,
        displayName,
        username: displayName.toLowerCase().replace(/\s+/g, ""),
        updatedAt: new Date().toISOString(),
        signature: "test",
        profileVisibility: "public",
      },
      null,
      2,
    ),
    { mode: 0o600 },
  );
}

async function prepareBrowserPage(page: Page, fx: TestFixtures): Promise<void> {
  await page.addInitScript(
    ({ wsUrl, ownerId }) => {
      localStorage.setItem(
        "envoymesh:app-settings",
        JSON.stringify({
          wsUrl,
          autoConnect: true,
          notificationsEnabled: false,
          showConnectionStatus: true,
          locale: "en",
        }),
      );
      localStorage.setItem(
        "envoymesh.setupComplete",
        JSON.stringify({ ownerId, completedAt: new Date().toISOString() }),
      );
      // Suppress first-run getting-started modal so Browser nav is clickable.
      localStorage.setItem(`envoymesh.guideSeen:${ownerId}`, "1");
    },
    { wsUrl: fx.spawner.node2WsUrl, ownerId: fx.spawner.node2OwnerId },
  );
  await page.goto("/");
  // Wait for the app shell / header nav (not the connecting splash).
  await page.getByTestId("nav-social").waitFor({ state: "visible", timeout: 60_000 });
  await fx.social.openBrowser();
}

async function setupFixtures(skipBonding = false): Promise<TestFixtures> {
  const spawner = new NodeSpawner({ skipBonding });
  await spawner.start();

  const aliceWebDir = join(spawner.node1ProfileDir, "web");
  await mkdir(join(aliceWebDir, "posts"), { recursive: true });
  await writeFile(
    join(aliceWebDir, "hello.md"),
    "# Hello from Alice\n\nThis is the Phase 45 web content smoke test.",
    { mode: 0o600 },
  );
  await writeFile(
    join(aliceWebDir, "web-content.json"),
    JSON.stringify(
      {
        version: "0.1",
        entries: [
          {
            path: "hello.md",
            contentHash: "any",
            byteLength: 60,
            title: "Hello from Alice",
            kind: "article",
            mimeType: "text/markdown",
            visibility: skipBonding ? "public" : "bonded",
            updatedAt: new Date().toISOString(),
          },
        ],
      },
      null,
      2,
    ),
    { mode: 0o600 },
  );

  await writeHumanProfile(spawner.node1ProfileDir, spawner.node1OwnerId, "Alice");
  await writeHumanProfile(spawner.node2ProfileDir, spawner.node2OwnerId, "Bob");

  return {
    spawner,
    aliceOwnerId: spawner.node1OwnerId,
    helloUrl: () => `envoy://${spawner.node1OwnerId}/hello.md`,
    social: null as unknown as SocialPage, // set per-test with the page
    cleanup: async () => {
      await spawner.stop();
    },
  };
}

test.describe("Web Content Browsing E2E (Phase 45A)", () => {
  test("1. fetch markdown → renders heading", async ({ page }) => {
    const fx = await setupFixtures();
    fx.social = new SocialPage(page, "bob");
    try {
      await prepareBrowserPage(page, fx);
      await fx.social.browseToUrl(fx.helloUrl());
      await fx.social.expectRenderedMarkdown("Hello from Alice");
      await expect(page.getByTestId("browser-status")).toContainText("text/markdown");
    } finally {
      await fx.cleanup();
    }
  });

  test("2. fetch image → renders <img> with blob: src", async ({ page }) => {
    const fx = await setupFixtures();
    fx.social = new SocialPage(page, "bob");
    try {
      const aliceWebDir = join(fx.spawner.node1ProfileDir, "web");
      const pngB64 =
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
      const pngBytes = Buffer.from(pngB64, "base64");
      await writeFile(join(aliceWebDir, "pixel.png"), pngBytes, { mode: 0o600 });
      await writeFile(
        join(aliceWebDir, "web-content.json"),
        JSON.stringify(
          {
            version: "0.1",
            entries: [
              {
                path: "pixel.png",
                contentHash: "any",
                byteLength: pngBytes.length,
                title: "Pixel",
                kind: "photo",
                mimeType: "image/png",
                visibility: "public",
                updatedAt: new Date().toISOString(),
              },
            ],
          },
          null,
          2,
        ),
        { mode: 0o600 },
      );
      await prepareBrowserPage(page, fx);
      await fx.social.browseToUrl(`envoy://${fx.aliceOwnerId}/pixel.png`);
      await fx.social.expectImageRendered();
    } finally {
      await fx.cleanup();
    }
  });

  test("3. fetch PDF → renders in <iframe>", async ({ page }) => {
    const fx = await setupFixtures();
    fx.social = new SocialPage(page, "bob");
    try {
      const pdfBytes = Buffer.from(
        "%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\nxref\n0 1\n0000000000 65535 f\ntrailer<</Size 1>>\nstartxref\n0\n%%EOF",
      );
      const aliceWebDir = join(fx.spawner.node1ProfileDir, "web");
      await writeFile(join(aliceWebDir, "blank.pdf"), pdfBytes, { mode: 0o600 });
      await writeFile(
        join(aliceWebDir, "web-content.json"),
        JSON.stringify(
          {
            version: "0.1",
            entries: [
              {
                path: "blank.pdf",
                contentHash: "any",
                byteLength: pdfBytes.length,
                title: "Blank",
                kind: "file",
                mimeType: "application/pdf",
                visibility: "public",
                updatedAt: new Date().toISOString(),
              },
            ],
          },
          null,
          2,
        ),
        { mode: 0o600 },
      );
      await prepareBrowserPage(page, fx);
      await fx.social.browseToUrl(`envoy://${fx.aliceOwnerId}/blank.pdf`);
      await fx.social.expectPdfRendered();
    } finally {
      await fx.cleanup();
    }
  });

  test("4. stranger denied (unbonded) → access denied / not found", async ({ page }) => {
    const fx = await setupFixtures(true);
    fx.social = new SocialPage(page, "bob");
    try {
      const aliceWebDir = join(fx.spawner.node1ProfileDir, "web");
      await writeFile(
        join(aliceWebDir, "web-content.json"),
        JSON.stringify(
          {
            version: "0.1",
            entries: [
              {
                path: "hello.md",
                contentHash: "any",
                byteLength: 60,
                title: "Hello from Alice",
                kind: "article",
                mimeType: "text/markdown",
                visibility: "bonded",
                updatedAt: new Date().toISOString(),
              },
            ],
          },
          null,
          2,
        ),
        { mode: 0o600 },
      );
      await prepareBrowserPage(page, fx);
      await fx.social.browseToUrl(fx.helloUrl());
      // Anti-leakage: strangers see not_found (same as missing), shown as error UI.
      await fx.social.expectNotFound();
    } finally {
      await fx.cleanup();
    }
  });

  test("5. bonded allowed → content served", async ({ page }) => {
    const fx = await setupFixtures();
    fx.social = new SocialPage(page, "bob");
    try {
      await prepareBrowserPage(page, fx);
      await fx.social.browseToUrl(fx.helloUrl());
      await fx.social.expectRenderedMarkdown("Hello from Alice");
    } finally {
      await fx.cleanup();
    }
  });

  test("6. back button navigates to previous page", async ({ page }) => {
    const fx = await setupFixtures();
    fx.social = new SocialPage(page, "bob");
    try {
      const aliceWebDir = join(fx.spawner.node1ProfileDir, "web");
      await writeFile(
        join(aliceWebDir, "page-a.md"),
        "# Page A\n\nFirst page.",
        { mode: 0o600 },
      );
      await writeFile(
        join(aliceWebDir, "page-b.md"),
        "# Page B\n\nSecond page.",
        { mode: 0o600 },
      );
      await writeFile(
        join(aliceWebDir, "web-content.json"),
        JSON.stringify(
          {
            version: "0.1",
            entries: [
              {
                path: "page-a.md",
                contentHash: "any",
                byteLength: 20,
                title: "Page A",
                kind: "article",
                mimeType: "text/markdown",
                visibility: "public",
                updatedAt: new Date().toISOString(),
              },
              {
                path: "page-b.md",
                contentHash: "any",
                byteLength: 20,
                title: "Page B",
                kind: "article",
                mimeType: "text/markdown",
                visibility: "public",
                updatedAt: new Date().toISOString(),
              },
            ],
          },
          null,
          2,
        ),
        { mode: 0o600 },
      );
      await prepareBrowserPage(page, fx);
      const urlA = `envoy://${fx.aliceOwnerId}/page-a.md`;
      const urlB = `envoy://${fx.aliceOwnerId}/page-b.md`;
      await fx.social.browseToUrl(urlA);
      await fx.social.expectRenderedMarkdown("Page A");
      await fx.social.browseToUrl(urlB);
      await fx.social.expectRenderedMarkdown("Page B");
      await expect(page.getByTestId("browser-back")).toBeEnabled();
      await page.getByTestId("browser-back").click();
      await fx.social.expectRenderedMarkdown("Page A");
    } finally {
      await fx.cleanup();
    }
  });

  test("7. malformed envoy:// URL → error message", async ({ page }) => {
    const fx = await setupFixtures();
    fx.social = new SocialPage(page, "bob");
    try {
      await prepareBrowserPage(page, fx);
      await page.getByTestId("browser-address-bar").fill("envoy:///posts/hello");
      await expect(page.getByTestId("browser-go")).toBeDisabled();
      await expect(page.getByTestId("browser-parse-error")).toBeVisible();
    } finally {
      await fx.cleanup();
    }
  });

  test("8. bookmark star persists after toggle", async ({ page }) => {
    const fx = await setupFixtures();
    fx.social = new SocialPage(page, "bob");
    try {
      await prepareBrowserPage(page, fx);
      await fx.social.browseToUrl(fx.helloUrl());
      await fx.social.expectRenderedMarkdown("Hello from Alice");
      const star = page.getByTestId("browser-bookmark-star");
      await expect(star).toBeVisible();
      await expect(star).toBeEnabled();
      await star.click();
      await expect(star).toHaveText("★");
      await star.click();
      await expect(star).toHaveText("☆");
    } finally {
      await fx.cleanup();
    }
  });

  test("9. contacts ACL deny (bonded but not listed) → access denied", async ({ page }) => {
    const fx = await setupFixtures();
    fx.social = new SocialPage(page, "bob");
    try {
      const aliceWebDir = join(fx.spawner.node1ProfileDir, "web");
      await writeFile(
        join(aliceWebDir, "exclusive.md"),
        "# Exclusive\n\nOnly selected contacts.",
        { mode: 0o600 },
      );
      await writeFile(
        join(aliceWebDir, "web-content.json"),
        JSON.stringify(
          {
            version: "0.1",
            entries: [
              {
                path: "exclusive.md",
                contentHash: "any",
                byteLength: 40,
                title: "Exclusive",
                kind: "article",
                mimeType: "text/markdown",
                visibility: "contacts",
                contactIds: ["envoy:owner:someone-else"],
                updatedAt: new Date().toISOString(),
              },
            ],
          },
          null,
          2,
        ),
        { mode: 0o600 },
      );
      await prepareBrowserPage(page, fx);
      await fx.social.browseToUrl(`envoy://${fx.aliceOwnerId}/exclusive.md`);
      await fx.social.expectAccessDenied();
    } finally {
      await fx.cleanup();
    }
  });

  test("10. contacts ACL allow (bonded and listed) → content served", async ({ page }) => {
    const fx = await setupFixtures();
    fx.social = new SocialPage(page, "bob");
    try {
      const aliceWebDir = join(fx.spawner.node1ProfileDir, "web");
      await writeFile(
        join(aliceWebDir, "exclusive.md"),
        "# For Bob\n\nYou are on the list.",
        { mode: 0o600 },
      );
      await writeFile(
        join(aliceWebDir, "web-content.json"),
        JSON.stringify(
          {
            version: "0.1",
            entries: [
              {
                path: "exclusive.md",
                contentHash: "any",
                byteLength: 40,
                title: "For Bob",
                kind: "article",
                mimeType: "text/markdown",
                visibility: "contacts",
                contactIds: [fx.spawner.node2OwnerId],
                updatedAt: new Date().toISOString(),
              },
            ],
          },
          null,
          2,
        ),
        { mode: 0o600 },
      );
      await prepareBrowserPage(page, fx);
      await fx.social.browseToUrl(`envoy://${fx.aliceOwnerId}/exclusive.md`);
      await fx.social.expectRenderedMarkdown("You are on the list.");
    } finally {
      await fx.cleanup();
    }
  });
});
