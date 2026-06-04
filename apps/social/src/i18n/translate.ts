import { en } from "./messages/en.js";
import type { Messages } from "./messages/en.js";

export type TranslateParams = Record<string, string | number>;

function readPath(obj: unknown, key: string): string | undefined {
  const parts = key.split(".");
  let cur: unknown = obj;
  for (const part of parts) {
    if (!cur || typeof cur !== "object" || !(part in (cur as Record<string, unknown>))) {
      return undefined;
    }
    cur = (cur as Record<string, unknown>)[part];
  }
  return typeof cur === "string" ? cur : undefined;
}

export function translate(
  messages: Messages,
  key: string,
  fallbackOrParams?: TranslateParams | string,
  params?: TranslateParams,
): string {
  // Resolve the template: look up the key, fall back to the en bundle,
  // then to the inline default text.
  const inlineFallback = typeof fallbackOrParams === "string" ? fallbackOrParams : undefined;
  const inlineParams = typeof fallbackOrParams === "string" ? params : fallbackOrParams;
  const template = readPath(messages, key) ?? readPath(en, key) ?? inlineFallback ?? key;
  if (!inlineParams) return template;
  return template.replace(/\{(\w+)\}/g, (_, name: string) => {
    const value = inlineParams[name];
    return value === undefined ? `{${name}}` : String(value);
  });
}
