/**
 * @vitest-environment jsdom
 */
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, act } from "@testing-library/react";
import { LocationGazetteerFields } from "../../src/components/profile/LocationGazetteerFields.js";
import { I18nTestProvider } from "../../src/context/I18nContext.js";

function renderFields(overrides?: Partial<React.ComponentProps<typeof LocationGazetteerFields>>) {
  const onCountryChange = vi.fn();
  const onRegionChange = vi.fn();
  const onCityChange = vi.fn();
  const props: React.ComponentProps<typeof LocationGazetteerFields> = {
    countryCode: "",
    regionCode: "",
    city: "",
    onCountryChange,
    onRegionChange,
    onCityChange,
    t: (key: string) => key,
    countryLabel: "Country",
    regionLabel: "Region",
    cityLabel: "City",
    countryPlaceholder: "US",
    regionPlaceholder: "MA",
    cityPlaceholder: "Boston",
    ...overrides,
  };
  render(
    <I18nTestProvider locale="en">
      <LocationGazetteerFields {...props} />
    </I18nTestProvider>,
  );
  return { onCountryChange, onRegionChange, onCityChange };
}

describe("LocationGazetteerFields", () => {
  it("reverts invalid country codes on blur", async () => {
    const { onCountryChange } = renderFields({
      countryCode: "US",
      t: (key) => (key === "gazetteer.countries.US" ? "United States" : key),
    });

    const input = screen.getByLabelText("Country") as HTMLInputElement;
    expect(input.value).toBe("United States");

    fireEvent.change(input, { target: { value: "XX" } });
    fireEvent.blur(input);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 150));
    });

    await waitFor(() => {
      expect(input.value).toBe("United States");
    });
    expect(onCountryChange).not.toHaveBeenCalledWith("XX");
  });
});
