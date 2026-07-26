/**
 * Phase 45D — PhotoWall author → browse (Playwright).
 *
 * Alice publishes a photo via the Browser authoring panel; Bob (bonded)
 * opens the gallery listing and the image.
 *
 * Design: docs/web-content-browsing-design.md §9.2
 *
 * Run: npm run smoke:web-content
 */

import { test, expect, type Browser, type Page } from "@playwright/test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NodeSpawner } from "./helpers/node-spawner.js";
import { SocialPage } from "./helpers/social-page.js";

/** 1×1 PNG */
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);

async function writeHumanProfile(
  profileDir: string,
  ownerId: string,
  displayName: string,
): Promise<void> {
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

async function openSocialAs(
  page: Page,
  wsUrl: string,
  ownerId: string,
  label: string,
): Promise<SocialPage> {
  await page.addInitScript(
    ({ wsUrl: w, ownerId: o }) => {
      localStorage.setItem(
        "envoymesh:app-settings",
        JSON.stringify({
          wsUrl: w,
          autoConnect: true,
          notificationsEnabled: false,
          showConnectionStatus: true,
          locale: "en",
        }),
      );
      localStorage.setItem(
        "envoymesh.setupComplete",
        JSON.stringify({ ownerId: o, completedAt: new Date().toISOString() }),
      );
      localStorage.setItem(`envoymesh.guideSeen:${o}`, "1");
    },
    { wsUrl, ownerId },
  );
  await page.goto("/");
  await page.getByTestId("nav-content").waitFor({ state: "visible", timeout: 60_000 });
  const social = new SocialPage(page, label);
  await social.openBrowser();
  return social;
}

test.describe("Web Content Author → PhotoWall (Phase 45D)", () => {
  test("Alice publishes photo; Bob browses gallery and image", async ({
    browser,
  }: {
    browser: Browser;
  }) => {
    test.setTimeout(180_000);
    const spawner = new NodeSpawner({ offset1: 140, offset2: 150 });
    await spawner.start();
    await writeHumanProfile(spawner.node1ProfileDir, spawner.node1OwnerId, "Alice");
    await writeHumanProfile(spawner.node2ProfileDir, spawner.node2OwnerId, "Bob");

    const uploadDir = await mkdtemp(join(tmpdir(), "envoymesh-photo-upload-"));
    const photoPath = join(uploadDir, "sunset.png");
    await writeFile(photoPath, TINY_PNG);

    const aliceCtx = await browser.newContext();
    const bobCtx = await browser.newContext();
    const alicePage = await aliceCtx.newPage();
    const bobPage = await bobCtx.newPage();

    try {
      const alice = await openSocialAs(
        alicePage,
        spawner.node1WsUrl,
        spawner.node1OwnerId,
        "alice",
      );
      await alice.publishPhoto({
        title: "Sunset",
        filePath: photoPath,
        gallery: "wall",
        visibility: "bonded",
      });

      const publishedUrl = (
        await alicePage.getByTestId("browser-author-published-url").innerText()
      ).trim();
      await expect(alicePage.getByTestId("browser-author-listing-url")).toContainText(
        "/photos/wall/",
      );
      expect(publishedUrl).toContain("photos/wall/");

      await alicePage.getByTestId("browser-author-done").click();

      const bob = await openSocialAs(
        bobPage,
        spawner.node2WsUrl,
        spawner.node2OwnerId,
        "bob",
      );
      const galleryUrl = `envoy://${spawner.node1OwnerId}/photos/wall/`;
      await bob.browseToUrl(galleryUrl);
      await bob.expectRenderedMarkdown("PhotoWall — wall");
      await expect(bobPage.getByTestId("browser-markdown")).toContainText("Sunset");

      const link = bobPage.getByTestId("browser-markdown").getByRole("link", {
        name: "Sunset",
      });
      if ((await link.count()) > 0) {
        await link.first().click();
      } else {
        await bob.browseToUrl(publishedUrl);
      }
      await bob.expectImageRendered();
    } finally {
      await spawner.stop();
      await aliceCtx.close().catch(() => {});
      await bobCtx.close().catch(() => {});
    }
  });
});
