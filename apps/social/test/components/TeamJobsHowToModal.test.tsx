/**
 * @vitest-environment jsdom
 */
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { TeamJobsHowToModal } from "../../src/components/TeamJobsHowToModal.js";
import { renderWithI18n } from "../helpers/render-with-i18n.js";

afterEach(() => {
  cleanup();
});

describe("TeamJobsHowToModal", () => {
  it("shows skill-based and role-based examples with rosters", () => {
    const onClose = vi.fn();
    renderWithI18n(<TeamJobsHowToModal onClose={onClose} />);

    expect(screen.getByTestId("team-jobs-howto-modal")).toBeTruthy();
    expect(screen.getByText(/Example A — Skill-based/i)).toBeTruthy();
    expect(screen.getByText(/Example B — Role-based/i)).toBeTruthy();
    expect(screen.getByText(/Alice — skills:/i)).toBeTruthy();
    expect(screen.getByText(/Dana — role:/i)).toBeTruthy();

    fireEvent.click(screen.getByTestId("team-jobs-howto-done"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
