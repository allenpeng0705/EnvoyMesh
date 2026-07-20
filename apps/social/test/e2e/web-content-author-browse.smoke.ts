/**
 * Phase 45D Scenario 2 — Author → publish → browse (Playwright).
 *
 * Alice publishes a blog post via the Social Browser authoring panel.
 * Bob (bonded) opens `envoy://…/blog/`, sees the listing, clicks through.
 *
 * Design: docs/web-content-browsing-design.md §9.2
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
  const social = new SocialPage(page, label);
  await social.openBrowser();
  return social;
}

test.describe("Web Content Author → Browse (Phase 45D Scenario 2)", () => {
  test("Alice publishes blog post; Bob browses listing and post", async ({
    browser,
  }: {
    browser: Browser;
  }) => {
    test.setTimeout(180_000);
    const spawner = new NodeSpawner({ offset1: 100, offset2: 110 });
    await spawner.start();
    await writeHumanProfile(spawner.node1ProfileDir, spawner.node1OwnerId, "Alice");
    await writeHumanProfile(spawner.node2ProfileDir, spawner.node2OwnerId, "Bob");

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
      await alice.publishBlogPost({
        title: "My First Post",
        body: "Hello world! This is my first post on my EnvoyMesh blog.",
        visibility: "bonded",
      });

      const publishedUrl = (
        await alicePage.getByTestId("browser-author-published-url").innerText()
      ).trim();
      await expect(alicePage.getByTestId("browser-author-listing-url")).toContainText("/blog/");
      expect(publishedUrl).toContain("blog/posts/");

      await alicePage.getByTestId("browser-author-done").click();

      // Alice self-preview of the listing (local short-circuit).
      await alice.browseToUrl(`envoy://${spawner.node1OwnerId}/blog/`);
      await alice.expectRenderedMarkdown("My First Post");

      const bob = await openSocialAs(
        bobPage,
        spawner.node2WsUrl,
        spawner.node2OwnerId,
        "bob",
      );
      const blogUrl = `envoy://${spawner.node1OwnerId}/blog/`;
      await bob.browseToUrl(blogUrl);
      await bob.expectRenderedMarkdown("My First Post");

      // Prefer in-content link; fall back to published URL if the renderer
      // does not expose a role=link for the markdown title.
      const link = bobPage.getByTestId("browser-markdown").getByRole("link", {
        name: "My First Post",
      });
      if ((await link.count()) > 0) {
        await link.click();
      } else {
        await bob.browseToUrl(publishedUrl);
      }
      await bob.expectRenderedMarkdown(
        "Hello world! This is my first post on my EnvoyMesh blog.",
      );
      await expect(bobPage.getByTestId("browser-markdown")).toContainText("My First Post");
    } finally {
      await spawner.stop();
      await aliceCtx.close().catch(() => {});
      await bobCtx.close().catch(() => {});
    }
  });
});
