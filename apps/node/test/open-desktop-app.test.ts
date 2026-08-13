import { describe, expect, it } from "vitest";
import {
  isDesktopAppId,
  DESKTOP_APP_IDS,
  desktopAppDownloadUrl,
  desktopAppHomeUrl,
  macDesktopAppInstalled,
  windowsDesktopAppExe,
} from "../src/open-desktop-app.js";

describe("open-desktop-app allowlist", () => {
  it("only accepts obsidian and notion", () => {
    expect(DESKTOP_APP_IDS).toEqual(["obsidian", "notion"]);
    expect(isDesktopAppId("obsidian")).toBe(true);
    expect(isDesktopAppId("notion")).toBe(true);
    expect(isDesktopAppId("chrome")).toBe(false);
    expect(isDesktopAppId("")).toBe(false);
    expect(isDesktopAppId(null)).toBe(false);
  });

  it("exposes official website / download URLs", () => {
    expect(desktopAppHomeUrl("obsidian")).toBe("https://obsidian.md");
    expect(desktopAppDownloadUrl("obsidian")).toBe("https://obsidian.md/download");
    expect(desktopAppHomeUrl("notion")).toBe("https://www.notion.so");
    expect(desktopAppDownloadUrl("notion")).toBe("https://www.notion.com/desktop");
  });

  it("exposes install probes without throwing", () => {
    expect(typeof macDesktopAppInstalled("obsidian")).toBe("boolean");
    expect(typeof macDesktopAppInstalled("notion")).toBe("boolean");
    // On non-Windows CI this is usually null; must not throw.
    expect(
      windowsDesktopAppExe("obsidian") === null ||
        typeof windowsDesktopAppExe("obsidian") === "string",
    ).toBe(true);
  });
});
