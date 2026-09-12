/**
 * Shared “How often” field for Coding heartbeat / schedule modals.
 * Presets + a Custom builder that never asks end users for raw cron.
 */
import { useMemo, useState } from "react";
import {
  CODING_HEARTBEAT_CRON_PRESETS,
  type CodingHeartbeatCronPreset,
} from "@envoymesh/api";
import { useT } from "../context/I18nContext.js";

export type CodingCronPresetKey = CodingHeartbeatCronPreset | "custom";

export type CodingCronFieldsProps = {
  /** Prefix for data-testid attributes (`coding-heartbeat` / `coding-schedule`). */
  testIdPrefix: string;
  legend: string;
  busy?: boolean;
  value: string;
  onChange: (cron: string) => void;
};

type CustomUnit = "minutes" | "hours" | "days";

const PRESET_KEYS: CodingHeartbeatCronPreset[] = ["5m", "15m", "1h", "daily"];

function presetChipLabel(
  t: (key: string, fallback: string, vars?: Record<string, string | number>) => string,
  key: CodingCronPresetKey,
): string {
  switch (key) {
    case "5m":
      return t("codingView.heartbeatPreset.5m", "5 min");
    case "15m":
      return t("codingView.heartbeatPreset.15m", "15 min");
    case "1h":
      return t("codingView.heartbeatPreset.1h", "Hourly");
    case "daily":
      return t("codingView.heartbeatPreset.daily", "Daily");
    case "custom":
      return t("codingView.heartbeatPreset.custom", "Custom");
  }
}

function presetSummary(
  t: (key: string, fallback: string, vars?: Record<string, string | number>) => string,
  key: CodingHeartbeatCronPreset,
): string {
  switch (key) {
    case "5m":
      return t(
        "codingView.cronSummary.everyMinutes",
        "Every {n} minutes · UTC",
        { n: 5 },
      );
    case "15m":
      return t(
        "codingView.cronSummary.everyMinutes",
        "Every {n} minutes · UTC",
        { n: 15 },
      );
    case "1h":
      return t("codingView.cronSummary.everyHour", "Every hour · UTC");
    case "daily":
      return t(
        "codingView.cronSummary.dailyAt",
        "Every day at {time} UTC",
        { time: "09:00" },
      );
  }
}

function clampInt(raw: string, min: number, max: number, fallback: number): number {
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function cronFromCustomInterval(amount: number, unit: CustomUnit): string {
  if (unit === "minutes") {
    const n = clampInt(String(amount), 1, 59, 15);
    return `*/${n} * * * *`;
  }
  if (unit === "hours") {
    const n = clampInt(String(amount), 1, 23, 1);
    return `0 */${n} * * *`;
  }
  const n = clampInt(String(amount), 1, 30, 1);
  return `0 9 */${n} * *`;
}

function parseCustomFromCron(cron: string): { amount: number; unit: CustomUnit } {
  const trimmed = cron.trim();
  const everyMin = trimmed.match(/^\*\/(\d+)\s+\*\s+\*\s+\*\s+\*$/);
  if (everyMin) {
    return { amount: clampInt(everyMin[1]!, 1, 59, 15), unit: "minutes" };
  }
  const everyHour = trimmed.match(/^0\s+\*\/(\d+)\s+\*\s+\*\s+\*$/);
  if (everyHour) {
    return { amount: clampInt(everyHour[1]!, 1, 23, 1), unit: "hours" };
  }
  const everyDay = trimmed.match(/^0\s+9\s+\*\/(\d+)\s+\*\s+\*$/);
  if (everyDay) {
    return { amount: clampInt(everyDay[1]!, 1, 30, 1), unit: "days" };
  }
  if (trimmed === "0 * * * *") return { amount: 1, unit: "hours" };
  if (trimmed === "0 9 * * *") return { amount: 1, unit: "days" };
  return { amount: 15, unit: "minutes" };
}

function customSummary(
  t: (key: string, fallback: string, vars?: Record<string, string | number>) => string,
  amount: number,
  unit: CustomUnit,
): string {
  if (unit === "minutes") {
    return t(
      "codingView.cronSummary.everyMinutes",
      "Every {n} minutes · UTC",
      { n: amount },
    );
  }
  if (unit === "hours") {
    return amount === 1
      ? t("codingView.cronSummary.everyHour", "Every hour · UTC")
      : t(
          "codingView.cronSummary.everyHours",
          "Every {n} hours · UTC",
          { n: amount },
        );
  }
  return amount === 1
    ? t(
        "codingView.cronSummary.dailyAt",
        "Every day at {time} UTC",
        { time: "09:00" },
      )
    : t(
        "codingView.cronSummary.everyDaysAt",
        "Every {n} days at {time} UTC",
        { n: amount, time: "09:00" },
      );
}

function maxForUnit(unit: CustomUnit): number {
  if (unit === "minutes") return 59;
  if (unit === "hours") return 23;
  return 30;
}

export function CodingCronFields({
  testIdPrefix,
  legend,
  busy = false,
  value,
  onChange,
}: CodingCronFieldsProps) {
  const t = useT();
  const matchedPreset = (PRESET_KEYS.find(
    (k) => CODING_HEARTBEAT_CRON_PRESETS[k] === value.trim(),
  ) ?? null) as CodingHeartbeatCronPreset | null;

  const [preset, setPreset] = useState<CodingCronPresetKey>(
    () => matchedPreset ?? "custom",
  );
  const initialCustom = parseCustomFromCron(value);
  const [amount, setAmount] = useState(String(initialCustom.amount));
  const [unit, setUnit] = useState<CustomUnit>(initialCustom.unit);

  const customCron = useMemo(() => {
    const n = clampInt(amount, 1, maxForUnit(unit), unit === "minutes" ? 15 : 1);
    return cronFromCustomInterval(n, unit);
  }, [amount, unit]);

  const summary = useMemo(() => {
    if (preset !== "custom") {
      return presetSummary(t, preset);
    }
    const n = clampInt(amount, 1, maxForUnit(unit), unit === "minutes" ? 15 : 1);
    return customSummary(t, n, unit);
  }, [preset, amount, unit, t]);

  const selectPreset = (key: CodingCronPresetKey) => {
    setPreset(key);
    if (key === "custom") {
      onChange(customCron);
      return;
    }
    onChange(CODING_HEARTBEAT_CRON_PRESETS[key]);
  };

  const applyCustom = (nextAmount: string, nextUnit: CustomUnit) => {
    setAmount(nextAmount);
    setUnit(nextUnit);
    const n = clampInt(
      nextAmount,
      1,
      maxForUnit(nextUnit),
      nextUnit === "minutes" ? 15 : 1,
    );
    onChange(cronFromCustomInterval(n, nextUnit));
  };

  return (
    <fieldset
      className="modal-field coding-job-modal__schedule"
      disabled={busy}
    >
      <legend>{legend}</legend>
      <div
        className="coding-job-modal__presets"
        role="group"
        aria-label={legend}
      >
        {PRESET_KEYS.map((key) => (
          <button
            key={key}
            type="button"
            className={`coding-job-modal__preset${
              preset === key ? " coding-job-modal__preset--active" : ""
            }`}
            data-testid={`${testIdPrefix}-preset-${key}`}
            onClick={() => selectPreset(key)}
          >
            {presetChipLabel(t, key)}
          </button>
        ))}
        <button
          type="button"
          className={`coding-job-modal__preset${
            preset === "custom" ? " coding-job-modal__preset--active" : ""
          }`}
          data-testid={`${testIdPrefix}-preset-custom`}
          onClick={() => selectPreset("custom")}
        >
          {presetChipLabel(t, "custom")}
        </button>
      </div>

      {preset === "custom" ? (
        <div
          className="coding-job-modal__custom-interval"
          data-testid={`${testIdPrefix}-custom-interval`}
        >
          <span className="coding-job-modal__custom-interval-label">
            {t("codingView.cronCustomEvery", "Every")}
          </span>
          <input
            type="number"
            min={1}
            max={maxForUnit(unit)}
            inputMode="numeric"
            className="coding-job-modal__custom-interval-amount"
            value={amount}
            data-testid={`${testIdPrefix}-custom-amount`}
            aria-label={t("codingView.cronCustomAmount", "Interval")}
            onChange={(e) => applyCustom(e.target.value, unit)}
          />
          <select
            className="coding-job-modal__custom-interval-unit"
            value={unit}
            data-testid={`${testIdPrefix}-custom-unit`}
            aria-label={t("codingView.cronCustomUnit", "Unit")}
            onChange={(e) =>
              applyCustom(amount, e.target.value as CustomUnit)
            }
          >
            <option value="minutes">
              {t("codingView.cronUnit.minutes", "minutes")}
            </option>
            <option value="hours">
              {t("codingView.cronUnit.hours", "hours")}
            </option>
            <option value="days">
              {t("codingView.cronUnit.days", "days")}
            </option>
          </select>
          <p className="coding-job-modal__hint coding-job-modal__custom-hint">
            {t(
              "codingView.cronCustomHint",
              "Pick how often it should run. Times use UTC (world clock).",
            )}
          </p>
          {/* Keep a stable test hook for the resolved cron expression. */}
          <input
            type="hidden"
            data-testid={`${testIdPrefix}-cron`}
            value={customCron}
            readOnly
          />
        </div>
      ) : null}

      <p
        className="coding-job-modal__cron-preview"
        data-testid={`${testIdPrefix}-cron-preview`}
      >
        {summary}
      </p>
    </fieldset>
  );
}
