/**
 * Phase 45E — feed.notify → Inbox → Browser (Playwright).
 *
 * Alice publishes a bonded blog post; Bob receives feed.notify in Inbox,
 * opens it in Browser, and sees the rendered post.
 *
 * Design: docs/web-content-browsing-design.md §7.5
 *
 * Run: npm run smoke:web-content
 */

import { test, expect, type Browser, type Page } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { NodeSpawner } from "./helpers/node-spawner.js";
import { SocialPage } from "./helpers/social-page.js";

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
  await page.getByTestId("nav-browser").waitFor({ state: "visible", timeout: 60_000 });
  return new SocialPage(page, label);
}

test.describe("Web Content feed.notify → Inbox → Browser (Phase 45E)", () => {
  test("Alice publishes; Bob opens feed.notify in Browser", async ({
    browser,
  }: {
    browser: Browser;
  }) => {
    test.setTimeout(180_000);
    const spawner = new NodeSpawner({ offset1: 120, offset2: 130 });
    await spawner.start();
    await writeHumanProfile(spawner.node1ProfileDir, spawner.node1OwnerId, "Alice");
    await writeHumanProfile(spawner.node2ProfileDir, spawner.node2OwnerId, "Bob");

    const aliceCtx = await browser.newContext();
    const bobCtx = await browser.newContext();
    const alicePage = await aliceCtx.newPage();
    const bobPage = await bobCtx.newPage();

    try {
      const postTitle = "Notify Me Post";
      const postBody = "Hello from Alice via feed.notify";

      // Bob connects first so WS can receive the live feed:notify event.
      const bob = await openSocialAs(
        bobPage,
        spawner.node2WsUrl,
        spawner.node2OwnerId,
        "bob",
      );
      await bob.openInbox();

      const alice = await openSocialAs(
        alicePage,
        spawner.node1WsUrl,
        spawner.node1OwnerId,
        "alice",
      );
      await alice.openBrowser();
      await alice.publishBlogPost({
        title: postTitle,
        body: postBody,
        visibility: "bonded",
      });

      await bob.waitForFeedNotify(postTitle, 90_000);
      await bob.openFeedNotifyInBrowser();
      await bob.expectRenderedMarkdown(postBody);
      await expect(bobPage.getByTestId("browser-markdown")).toContainText(postTitle);
    } finally {
      await spawner.stop();
      await aliceCtx.close().catch(() => {});
      await bobCtx.close().catch(() => {});
    }
  });
});
