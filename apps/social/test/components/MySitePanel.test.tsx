/**
 * @vitest-environment jsdom
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithI18n } from "../helpers/render-with-i18n.js";
import { MySitePanel } from "../../src/components/MySitePanel.js";
import * as browserNav from "../../src/lib/browser-nav.js";

const listWebContentSections = vi.fn(async () => [] as unknown[]);

vi.mock("../../src/hooks/useNodeService.js", () => ({
  useNodeService: () => ({
    listWebContentSections,
    isConnected: true,
  }),
}));

beforeEach(() => {
  listWebContentSections.mockReset();
  listWebContentSections.mockResolvedValue([]);
});

afterEach(() => {
  cleanup();
});

describe("MySitePanel", () => {
  it("opens profile/blog/photowall via onOpenUrl", () => {
    const onOpenUrl = vi.fn();
    renderWithI18n(
      <MySitePanel ownerId="envoy:owner:self" onOpenUrl={onOpenUrl} onCreate={vi.fn()} />,
    );
    fireEvent.click(screen.getByTestId("my-site-open-profile"));
    fireEvent.click(screen.getByTestId("my-site-open-blog"));
    fireEvent.click(screen.getByTestId("my-site-open-photowall"));
    expect(onOpenUrl).toHaveBeenCalledWith("envoy://envoy:owner:self/");
    expect(onOpenUrl).toHaveBeenCalledWith("envoy://envoy:owner:self/blog/");
    expect(onOpenUrl).toHaveBeenCalledWith("envoy://envoy:owner:self/photos/");
  });

  it("calls onCreate for edit actions including Add section", () => {
    const onCreate = vi.fn();
    renderWithI18n(
      <MySitePanel ownerId="envoy:owner:self" onOpenUrl={vi.fn()} onCreate={onCreate} />,
    );
    fireEvent.click(screen.getByTestId("my-site-edit-profile"));
    fireEvent.click(screen.getByTestId("my-site-new-post"));
    fireEvent.click(screen.getByTestId("my-site-add-photo"));
    fireEvent.click(screen.getByTestId("my-site-add-section"));
    expect(onCreate).toHaveBeenCalledWith("profile");
    expect(onCreate).toHaveBeenCalledWith("blog-post");
    expect(onCreate).toHaveBeenCalledWith("photo");
    expect(onCreate).toHaveBeenCalledWith("section");
  });

  it("lists custom sections from the node", async () => {
    listWebContentSections.mockResolvedValue([
      {
        title: "Market",
        slug: "market",
        path: "market/index.md",
        url: "envoy://envoy:owner:self/market/",
        visibility: "bonded",
        updatedAt: "2026-07-21T00:00:00.000Z",
      },
    ]);
    const onOpenUrl = vi.fn();
    renderWithI18n(
      <MySitePanel ownerId="envoy:owner:self" onOpenUrl={onOpenUrl} onCreate={vi.fn()} />,
    );
    await waitFor(() => {
      expect(screen.getByTestId("my-site-open-section-market")).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId("my-site-open-section-market"));
    expect(onOpenUrl).toHaveBeenCalledWith("envoy://envoy:owner:self/market/");
  });

  it("reloads sections when web-sections-changed fires", async () => {
    renderWithI18n(
      <MySitePanel ownerId="envoy:owner:self" onOpenUrl={vi.fn()} onCreate={vi.fn()} />,
    );
    await waitFor(() => {
      expect(listWebContentSections.mock.calls.length).toBeGreaterThanOrEqual(1);
    });
    const callsBefore = listWebContentSections.mock.calls.length;
    listWebContentSections.mockResolvedValue([
      {
        title: "Market",
        slug: "market",
        path: "market/index.md",
        url: "envoy://envoy:owner:self/market/",
        visibility: "bonded",
        updatedAt: "2026-07-21T00:00:00.000Z",
      },
    ]);
    window.dispatchEvent(new CustomEvent(browserNav.WEB_SECTIONS_CHANGED_EVENT));
    await waitFor(() => {
      expect(screen.getByTestId("my-site-open-section-market")).toBeTruthy();
    });
    expect(listWebContentSections.mock.calls.length).toBeGreaterThan(callsBefore);
  });

  it("falls back to openBrowserAuthor when onCreate omitted", () => {
    const spy = vi.spyOn(browserNav, "openBrowserAuthor").mockImplementation(() => undefined);
    renderWithI18n(<MySitePanel ownerId="envoy:owner:self" />);
    fireEvent.click(screen.getByTestId("my-site-new-post"));
    expect(spy).toHaveBeenCalledWith("blog-post");
  });
});
