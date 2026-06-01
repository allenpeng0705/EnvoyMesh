import type { LocaleId } from "../types.js";
import { en } from "./en.js";
import { zh } from "./zh.js";
import { ko } from "./ko.js";
import { ja } from "./ja.js";
import { fr } from "./fr.js";
import { de } from "./de.js";
import { it } from "./it.js";
import type { Messages } from "./en.js";

export const MESSAGES: Record<LocaleId, Messages> = {
  en,
  zh,
  ko,
  ja,
  fr,
  de,
  it,
};

export { en, zh, ko, ja, fr, de, it };
export type { Messages };
