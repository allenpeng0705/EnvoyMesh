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

export function translate(messages: Messages, key: string, params?: TranslateParams): string {
  const template = readPath(messages, key) ?? readPath(en, key) ?? key;
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, name: string) => {
    const value = params[name];
    return value === undefined ? `{${name}}` : String(value);
  });
}
