/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import {
  ChatIcon,
  ContactsIcon,
  SearchIcon,
  ProfileIcon,
  SettingsIcon,
  AIIcon,
  SendIcon,
  BackIcon,
  CloseIcon,
  CheckIcon,
  PublicIcon,
  PrivateIcon,
  DarkModeIcon,
  LightModeIcon,
  EditIcon,
  SaveIcon,
  InboxIcon,
  CopyIcon,
  P2PIcon,
  RelayIcon,
  ExpandIcon,
  CollapseIcon,
  AddIcon,
  RemoveIcon,
  ICON_MAP,
} from "../../src/icons.js";

afterEach(() => cleanup());

describe("icons", () => {
  const iconComponents = [
    ChatIcon,
    ContactsIcon,
    SearchIcon,
    ProfileIcon,
    SettingsIcon,
    AIIcon,
    SendIcon,
    BackIcon,
    CloseIcon,
    CheckIcon,
    PublicIcon,
    PrivateIcon,
    DarkModeIcon,
    LightModeIcon,
    EditIcon,
    SaveIcon,
    InboxIcon,
    CopyIcon,
    P2PIcon,
    RelayIcon,
    ExpandIcon,
    CollapseIcon,
    AddIcon,
    RemoveIcon,
  ];

  it.each(iconComponents)("renders %s without crashing", (Icon) => {
    const { container } = render(<Icon />);
    const svg = container.querySelector("svg");
    expect(svg).toBeTruthy();
    expect(svg!.getAttribute("viewBox")).toBe("0 0 24 24");
    expect(svg!.getAttribute("stroke")).toBe("currentColor");
    expect(svg!.getAttribute("stroke-width")).toBe("2");
  });

  it.each(iconComponents)("accepts a size prop", (Icon) => {
    const { container } = render(<Icon size={16} />);
    const svg = container.querySelector("svg");
    expect(svg!.getAttribute("width")).toBe("16");
    expect(svg!.getAttribute("height")).toBe("16");
  });

  it.each(iconComponents)("accepts a className prop", (Icon) => {
    const { container } = render(<Icon className="my-icon" />);
    const svg = container.querySelector("svg");
    expect(svg!.classList.contains("my-icon")).toBe(true);
  });

  it.each(iconComponents)("defaults to size 24 when no size is provided", (Icon) => {
    const { container } = render(<Icon />);
    const svg = container.querySelector("svg");
    expect(svg!.getAttribute("width")).toBe("24");
    expect(svg!.getAttribute("height")).toBe("24");
  });

  it.each(iconComponents)("has aria-hidden=true for accessibility", (Icon) => {
    const { container } = render(<Icon />);
    const svg = container.querySelector("svg");
    expect(svg!.getAttribute("aria-hidden")).toBe("true");
  });

  it.each(iconComponents)("has displayName set", (Icon) => {
    expect(Icon.displayName).toBeTruthy();
    expect(typeof Icon.displayName).toBe("string");
  });

  it("all icons are in ICON_MAP", () => {
    const names = Object.keys(ICON_MAP);
    // ICON_MAP may contain more icons than we test individually
    expect(names.length).toBeGreaterThanOrEqual(iconComponents.length);

    // Each icon component should be in ICON_MAP values (by reference)
    for (const Icon of iconComponents) {
      const found = Object.values(ICON_MAP).some((v) => v === Icon);
      expect(found).toBe(true);
    }
  });
});
