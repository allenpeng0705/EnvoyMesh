/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import { insertTextAtCaret } from "../../src/lib/insert-text-at-caret.js";

describe("insertTextAtCaret", () => {
  it("inserts at selection and returns new caret", () => {
    const el = document.createElement("textarea");
    el.value = "hi there";
    el.setSelectionRange(2, 2);
    const { value, caret } = insertTextAtCaret(el, "👋");
    expect(value).toBe("hi👋 there");
    expect(caret).toBe(4);
  });

  it("replaces a selected range", () => {
    const el = document.createElement("textarea");
    el.value = "hello";
    el.setSelectionRange(1, 4);
    const { value, caret } = insertTextAtCaret(el, "i");
    expect(value).toBe("hio");
    expect(caret).toBe(2);
  });
});
