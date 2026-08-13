import { describe, expect, it } from "vitest";
import {
  isDesktopAppId,
  DESKTOP_APP_IDS,
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
