import type { Messages } from "./messages/en.js";

type DeepPartial<T> = T extends string
  ? string
  : T extends readonly (infer U)[]
    ? readonly U[]
    : T extends object
      ? { [K in keyof T]?: DeepPartial<T[K]> }
      : never;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function mergeMessages(base: Messages, overrides: DeepPartial<Messages>): Messages {
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) continue;
    const baseValue = (base as Record<string, unknown>)[key];
    if (isPlainObject(baseValue) && isPlainObject(value)) {
      out[key] = mergeMessages(baseValue as Messages, value as DeepPartial<Messages>);
    } else {
      out[key] = value;
    }
  }
  return out as Messages;
}

export type { DeepPartial };
