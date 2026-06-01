import { useEffect, useId, useMemo, useState } from "react";
import {
  localizeCity,
  localizeCountry,
  localizeRegion,
  resolveCitySelection,
  resolveCountrySelection,
  resolveRegionSelection,
  searchGazetteerCities,
  searchGazetteerCountries,
  searchGazetteerRegions,
  type TranslateFn,
} from "../../lib/gazetteer.js";

interface LocationGazetteerFieldsProps {
  countryCode: string;
  regionCode: string;
  city: string;
  onCountryChange: (code: string) => void;
  onRegionChange: (code: string) => void;
  onCityChange: (city: string) => void;
  t: TranslateFn;
  countryLabel: string;
  regionLabel: string;
  cityLabel: string;
  countryPlaceholder: string;
  regionPlaceholder: string;
  cityPlaceholder: string;
}

function GazetteerAutocomplete(props: {
  id: string;
  label: string;
  value: string;
  placeholder: string;
  options: string[];
  onChange: (value: string) => void;
  onCommit: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const listId = `${props.id}-list`;

  return (
    <div className="gazetteer-field">
      <input
        id={props.id}
        type="text"
        value={props.value}
        placeholder={props.placeholder}
        aria-label={props.label}
        aria-autocomplete="list"
        aria-controls={listId}
        aria-expanded={open && props.options.length > 0}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          window.setTimeout(() => {
            setOpen(false);
            props.onCommit(props.value);
          }, 120);
        }}
        onChange={(e) => {
          props.onChange(e.target.value);
          setOpen(true);
        }}
      />
      {open && props.options.length > 0 ? (
        <ul id={listId} className="gazetteer-suggestions" role="listbox">
          {props.options.map((option) => (
            <li key={option}>
              <button
                type="button"
                role="option"
                className="gazetteer-suggestion"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  props.onChange(option);
                  props.onCommit(option);
                  setOpen(false);
                }}
              >
                {option}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function LocationGazetteerFields(props: LocationGazetteerFieldsProps) {
  const baseId = useId();
  const [countryInput, setCountryInput] = useState(
    props.countryCode ? localizeCountry(props.countryCode, props.t) : "",
  );
  const [regionInput, setRegionInput] = useState(
    props.regionCode && props.countryCode
      ? localizeRegion(props.countryCode, props.regionCode, props.t)
      : props.regionCode,
  );
  const [cityInput, setCityInput] = useState(
    props.city && props.regionCode && props.countryCode
      ? localizeCity(props.countryCode, props.regionCode, props.city, props.t)
      : props.city,
  );

  useEffect(() => {
    setCountryInput(props.countryCode ? localizeCountry(props.countryCode, props.t) : "");
  }, [props.countryCode, props.t]);

  useEffect(() => {
    setRegionInput(
      props.regionCode && props.countryCode
        ? localizeRegion(props.countryCode, props.regionCode, props.t)
        : props.regionCode,
    );
  }, [props.countryCode, props.regionCode, props.t]);

  useEffect(() => {
    setCityInput(
      props.city && props.regionCode && props.countryCode
        ? localizeCity(props.countryCode, props.regionCode, props.city, props.t)
        : props.city,
    );
  }, [props.city, props.countryCode, props.regionCode, props.t]);

  const countryOptions = useMemo(
    () =>
      searchGazetteerCountries(countryInput, props.t)
        .slice(0, 8)
        .map((country) => localizeCountry(country.code, props.t)),
    [countryInput, props.t],
  );

  const regionOptions = useMemo(() => {
    if (!props.countryCode) return [];
    return searchGazetteerRegions(props.countryCode, regionInput, props.t)
      .slice(0, 8)
      .map((region) => localizeRegion(props.countryCode, region.code, props.t));
  }, [props.countryCode, regionInput, props.t]);

  const cityOptions = useMemo(() => {
    if (!props.countryCode || !props.regionCode) return [];
    return searchGazetteerCities(props.countryCode, props.regionCode, cityInput, props.t)
      .slice(0, 8)
      .map((city) => localizeCity(props.countryCode, props.regionCode, city, props.t));
  }, [props.countryCode, props.regionCode, cityInput, props.t]);

  return (
    <>
      <GazetteerAutocomplete
        id={`${baseId}-country`}
        label={props.countryLabel}
        value={countryInput}
        placeholder={props.countryPlaceholder}
        options={countryOptions}
        onChange={setCountryInput}
        onCommit={(value) => {
          const resolved = resolveCountrySelection(value, props.t);
          if (resolved) {
            props.onCountryChange(resolved);
            setCountryInput(localizeCountry(resolved, props.t));
            props.onRegionChange("");
            props.onCityChange("");
            setRegionInput("");
            setCityInput("");
            return;
          }
          setCountryInput(
            props.countryCode ? localizeCountry(props.countryCode, props.t) : "",
          );
        }}
      />
      <GazetteerAutocomplete
        id={`${baseId}-region`}
        label={props.regionLabel}
        value={regionInput}
        placeholder={props.regionPlaceholder}
        options={regionOptions}
        onChange={setRegionInput}
        onCommit={(value) => {
          if (!props.countryCode) {
            props.onRegionChange(value.trim().toUpperCase());
            return;
          }
          const resolved = resolveRegionSelection(props.countryCode, value, props.t);
          if (resolved) {
            props.onRegionChange(resolved);
            setRegionInput(localizeRegion(props.countryCode, resolved, props.t));
            props.onCityChange("");
            setCityInput("");
            return;
          }
          props.onRegionChange(value.trim().toUpperCase());
        }}
      />
      <GazetteerAutocomplete
        id={`${baseId}-city`}
        label={props.cityLabel}
        value={cityInput}
        placeholder={props.cityPlaceholder}
        options={cityOptions}
        onChange={setCityInput}
        onCommit={(value) => {
          if (!props.countryCode || !props.regionCode) {
            props.onCityChange(value.trim());
            return;
          }
          const resolved = resolveCitySelection(props.countryCode, props.regionCode, value, props.t);
          props.onCityChange(resolved ?? value.trim());
          if (resolved) {
            setCityInput(localizeCity(props.countryCode, props.regionCode, resolved, props.t));
          }
        }}
      />
    </>
  );
}
