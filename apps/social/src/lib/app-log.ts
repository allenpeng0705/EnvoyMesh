import { appendSocialLogLine, isTauriShell } from "./tauri-shell.js";

type LogLevel = "log" | "info" | "warn" | "error";

const MAX_BUFFER = 500;
const buffer: string[] = [];

function formatLine(level: LogLevel, args: unknown[]): string {
  const ts = new Date().toISOString();
  const body = args
    .map((arg) => {
      if (arg instanceof Error) return arg.stack ?? arg.message;
      if (typeof arg === "string") return arg;
      try {
        return JSON.stringify(arg);
      } catch {
        return String(arg);
      }
    })
    .join(" ");
  return `[${ts}] [${level}] ${body}`;
}

function pushLine(line: string): void {
  buffer.push(line);
  if (buffer.length > MAX_BUFFER) {
    buffer.splice(0, buffer.length - MAX_BUFFER);
  }
  if (isTauriShell()) {
    void appendSocialLogLine(line).catch(() => {});
  }
}

function wrapConsole(level: LogLevel, original: (...args: unknown[]) => void): (...args: unknown[]) => void {
  return (...args: unknown[]) => {
    original(...args);
    pushLine(formatLine(level, args));
  };
}

/** Mirror console output to an in-memory ring buffer and Tauri social.log when available. */
export function initAppLog(): void {
  if (typeof window === "undefined") return;
  const w = window as Window & { __envoyAppLogInstalled?: boolean };
  if (w.__envoyAppLogInstalled) return;
  w.__envoyAppLogInstalled = true;

  console.log = wrapConsole("log", console.log.bind(console));
  console.info = wrapConsole("info", console.info.bind(console));
  console.warn = wrapConsole("warn", console.warn.bind(console));
  console.error = wrapConsole("error", console.error.bind(console));

  window.addEventListener("error", (event) => {
    pushLine(formatLine("error", [event.message, event.filename, event.lineno]));
  });
  window.addEventListener("unhandledrejection", (event) => {
    pushLine(formatLine("error", ["unhandledrejection", event.reason]));
  });

  pushLine(formatLine("info", ["Social UI logging initialized"]));
}

export function getAppLogBuffer(): readonly string[] {
  return buffer;
}
