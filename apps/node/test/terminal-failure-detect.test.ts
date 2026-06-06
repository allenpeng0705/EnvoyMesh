import { describe, expect, it } from "vitest";

import { detectGoalSuccess, detectTerminalFailure } from "../src/terminal-failure-detect.js";

describe("detectTerminalFailure", () => {
  it("detects npm ERR in tail", () => {
    const scrollback = "running tests...\nnpm ERR! code ELIFECYCLE\nnpm ERR! errno 1";
    expect(detectTerminalFailure(scrollback).failed).toBe(true);
  });

  it("detects prepare mode non-zero exit", () => {
    const scrollback = "user@host:~/proj$ npm test\n[envoy-prepare exit:1] user@host:~/proj$";
    expect(detectTerminalFailure(scrollback).failed).toBe(true);
  });

  it("ignores clean output", () => {
    expect(detectTerminalFailure("all good\nOK\n").failed).toBe(false);
  });
});

describe("detectGoalSuccess", () => {
  it("returns true when tests pass and goal mentions green", () => {
    const scrollback = "Running tests...\nAll tests passed\n";
    expect(detectGoalSuccess(scrollback, "run tests until green")).toBe(true);
  });

  it("returns false when failure present", () => {
    const scrollback = "npm ERR! test failed\n";
    expect(detectGoalSuccess(scrollback, "run tests until green")).toBe(false);
  });

  it("returns false for generic goal without success intent", () => {
    const scrollback = "All tests passed\n";
    expect(detectGoalSuccess(scrollback, "list files")).toBe(false);
  });

  it("returns true for version-check goals when version output appears", () => {
    const scrollback = "envoy> npx -y openclaw --version\nOpenClaw 2026.6.2 (a9a386d)\nenvoy> ";
    expect(detectGoalSuccess(scrollback, "check openclaw's version")).toBe(true);
  });

  it("returns false for version-check goals without version output", () => {
    const scrollback = "envoy> npm list openclaw\n└── (empty)\nenvoy> ";
    expect(detectGoalSuccess(scrollback, "check openclaw's version")).toBe(false);
  });
});
