import { describe, it as test, expect } from "vitest";
import { en } from "../src/i18n/messages/en.js";
import { zh } from "../src/i18n/messages/zh.js";
import { de } from "../src/i18n/messages/de.js";
import { fr } from "../src/i18n/messages/fr.js";
import { ja } from "../src/i18n/messages/ja.js";
import { ko } from "../src/i18n/messages/ko.js";
import { it as itMessages } from "../src/i18n/messages/it.js";

/**
 * One vocabulary, seven languages: a Task is never called a "workspace".
 *
 * ## Why this file exists
 *
 * The workspace→task rename (`caf90492`) changed 882 occurrences and the English copy, and stopped
 * there — the translations kept the old noun. Chinese showed **添加工作区** ("Add workspace") where the
 * English said "Add task", in 47 strings, and every existing gate stayed green, because a translation
 * that is *present* counts as done: `i18n-gap-audit` measures keys that were never translated, and
 * nothing measures a translated key that now says the wrong thing. A rename is exactly the change that
 * breaks that way, so the check has to compare each string against its English source rather than count.
 *
 * ## The rules are derived, not listed
 *
 * There is deliberately **no allowlist of exceptions** here. "Workspace" is not a forbidden word in this
 * product: OpenClaw has a workspace directory, herdr has one, and the vault lists agent workspace
 * files. The rule is therefore about *agreement with English*, not about the word:
 *
 *   1. English says "task" at a key ⇒ no language may use its word for a workspace there.
 *   2. A language uses its word for a workspace ⇒ English must use "workspace" at that key.
 *
 * Rule 1 is the reported defect. Rule 2 is its mirror — it catches a translation that *invents* a
 * workspace the English source no longer mentions (three `library.hint` strings did: they described
 * "agent workspace files" in a sentence whose English had long since stopped saying it).
 *
 * Both words are per-language and inherited from the catalogues themselves — 任务 / Aufgabe / tâche /
 * attività / タスク / 작업 are the words each language already used for a task in its team-job strings —
 * so this file cannot disagree with the product about what a task is called.
 */

const LANGUAGES = {
  zh: { messages: zh, workspace: ["工作区"], task: ["任务"] },
  de: { messages: de, workspace: ["Arbeitsbereich", "Arbeitsfläche"], task: ["Aufgabe"] },
  fr: { messages: fr, workspace: ["espace de travail", "espaces de travail"], task: ["tâche"] },
  it: { messages: itMessages, workspace: ["area di lavoro", "aree di lavoro", "spazio di lavoro"], task: ["attività"] },
  ja: { messages: ja, workspace: ["ワークスペース"], task: ["タスク"] },
  ko: { messages: ko, workspace: ["워크스페이스"], task: ["작업"] },
} as const;

function flatten(obj: unknown, prefix = "", out: Record<string, string> = {}) {
  if (!obj || typeof obj !== "object") return out;
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "string") out[path] = v;
    else if (Array.isArray(v)) v.forEach((item, i) => flatten(item, `${path}[${i}]`, out));
    else if (v && typeof v === "object") flatten(v, path, out);
  }
  return out;
}

const EN = flatten(en);
const says = (text: string | undefined, words: readonly string[]) =>
  text !== undefined && words.some((w) => text.toLowerCase().includes(w.toLowerCase()));

const enSaysTask = (text: string) => /\btasks?\b/i.test(text);
const enSaysWorkspace = (text: string) => /\bworkspaces?\b/i.test(text);

describe("the family's vocabulary, in every language", () => {
  test("never calls a task a workspace — the rename's other half", () => {
    const offenders: string[] = [];
    for (const [locale, language] of Object.entries(LANGUAGES)) {
      for (const [key, value] of Object.entries(flatten(language.messages))) {
        const english = EN[key];
        if (english === undefined || !enSaysTask(english)) continue;
        if (!says(value, language.workspace)) continue;
        offenders.push(
          `  ${locale} ${key}\n      en: ${english.slice(0, 110)}\n      ${locale}: ${value.slice(0, 110)}`,
        );
      }
    }
    expect(
      offenders,
      `English says "task" at these keys and the translation says "workspace". The concept is a task\n` +
        `(Project = a place, Task = a unit of work in it); see the vocabulary note in the family guide.\n` +
        `${offenders.join("\n")}`,
    ).toEqual([]);
  });

  test("never invents a workspace the English source does not mention", () => {
    const offenders: string[] = [];
    for (const [locale, language] of Object.entries(LANGUAGES)) {
      for (const [key, value] of Object.entries(flatten(language.messages))) {
        const english = EN[key];
        if (english === undefined || !says(value, language.workspace)) continue;
        if (enSaysWorkspace(english)) continue;
        offenders.push(`  ${locale} ${key}\n      en: ${english.slice(0, 110)}\n      ${locale}: ${value.slice(0, 110)}`);
      }
    }
    expect(
      offenders,
      `These translations use "workspace" where the English source does not. Either the translation is\n` +
        `stale (rewrite it) or the English lost the word by accident (restore it).\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  test("checks something real: the English source says 'task' at many keys, and each language has a word for it", () => {
    // A gate whose pattern silently stopped matching passes forever. This is the self-test: the words
    // below are the ones the catalogues actually use, so a language whose entry here is wrong fails
    // loudly instead of being compared against a term nobody writes.
    const taskKeys = Object.keys(EN).filter((key) => enSaysTask(EN[key] ?? ""));
    // 61 when this was written. A floor rather than the number itself: copy changes, and a checker that
    // fails because someone reworded a sentence teaches people to edit the test instead of the gate.
    expect(taskKeys.length).toBeGreaterThan(40);

    for (const [locale, language] of Object.entries(LANGUAGES)) {
      const strings = Object.values(flatten(language.messages));
      expect(
        strings.some((value) => says(value, language.task)),
        `${locale}: no string uses its word for a task (${language.task.join(", ")}) — the list is wrong`,
      ).toBe(true);
      expect(language.workspace.length).toBeGreaterThan(0);
    }
  });

  test("still lets a real directory be a workspace, where English says so", () => {
    // The other half of "no allowlist": the legitimate uses must survive the check, or the rule would
    // eventually be satisfied by deleting the word from every language. OpenClaw's workspace directory
    // and the vault's file list are the ones that exist today.
    const legitimate = Object.entries(LANGUAGES).flatMap(([locale, language]) =>
      Object.entries(flatten(language.messages))
        .filter(([key, value]) => says(value, language.workspace) && enSaysWorkspace(EN[key] ?? ""))
        .map(([key]) => `${locale}:${key}`),
    );
    expect(legitimate.length).toBeGreaterThan(0);
  });
});
