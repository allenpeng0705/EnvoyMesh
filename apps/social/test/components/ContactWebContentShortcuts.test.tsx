/**
 * @vitest-environment jsdom
 */
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { ContactWebContentShortcuts } from "../../src/components/ContactWebContentShortcuts.js";
import { OPEN_SOCIAL_CONTENT_EVENT } from "../../src/lib/social-content-nav.js";
import { renderWithI18n } from "../helpers/render-with-i18n.js";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  try {
    sessionStorage.clear();
  } catch {
    /* ignore */
  }
});

describe("ContactWebContentShortcuts", () => {
  it("opens Content Feed/Blog tabs (not Browser) for contact Feed and Blog", () => {
    const onSocial = vi.fn();
    window.addEventListener(OPEN_SOCIAL_CONTENT_EVENT, onSocial as EventListener);

    renderWithI18n(<ContactWebContentShortcuts ownerId="envoy:owner:alice" />);

    fireEvent.click(screen.getByTestId("web-content-feeds"));
    expect(onSocial).toHaveBeenCalledTimes(1);
    expect((onSocial.mock.calls[0]![0] as CustomEvent).detail).toEqual({
      surface: "feed",
      ownerId: "envoy:owner:alice",
    });

    fireEvent.click(screen.getByTestId("web-content-blog"));
    expect(onSocial).toHaveBeenCalledTimes(2);
    expect((onSocial.mock.calls[1]![0] as CustomEvent).detail).toEqual({
      surface: "blog",
      ownerId: "envoy:owner:alice",
    });

    window.removeEventListener(OPEN_SOCIAL_CONTENT_EVENT, onSocial as EventListener);
  });

  it("keeps Profile/Photo on Browser navigation", () => {
    const onBrowser = vi.fn();
    window.addEventListener("envoymesh:open-browser", onBrowser);

    renderWithI18n(<ContactWebContentShortcuts ownerId="envoy:owner:alice" />);
    fireEvent.click(screen.getByTestId("web-content-profile"));
    expect(onBrowser).toHaveBeenCalled();

    window.removeEventListener("envoymesh:open-browser", onBrowser);
  });
});
