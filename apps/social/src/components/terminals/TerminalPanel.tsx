import { useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";

import type { TerminalSessionSummary } from "@envoymesh/api";

import { useNodeService } from "../../hooks/useNodeService.js";
import { useT } from "../../context/I18nContext.js";
import { TerminalWsClient } from "../../lib/terminal-ws-client.js";

interface TerminalPanelProps {
  session: TerminalSessionSummary | null;
}

export function TerminalPanel({ session }: TerminalPanelProps) {
  const nodeService = useNodeService();
  const t = useT();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<TerminalWsClient | null>(null);
  const [status, setStatus] = useState<string>("");

  useEffect(() => {
    if (!containerRef.current) return;
    const term = new Terminal({
      cursorBlink: true,
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
      fontSize: 13,
      theme: {
        background: "#0d1117",
        foreground: "#e6edf3",
      },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(containerRef.current);
    fit.fit();
    termRef.current = term;
    fitRef.current = fit;

    const onResize = () => {
      fit.fit();
      const cols = term.cols;
      const rows = term.rows;
      wsRef.current?.sendResize(cols, rows);
    };
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      wsRef.current?.close();
      wsRef.current = null;
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
  }, []);

  useEffect(() => {
    wsRef.current?.close();
    wsRef.current = null;
    termRef.current?.reset();
    setStatus("");

    if (!session || session.state !== "running") {
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const attach = await nodeService.terminalAttach({
          sessionId: session.sessionId,
          cols: termRef.current?.cols,
          rows: termRef.current?.rows,
        });
        if (cancelled || !termRef.current) return;

        const client = new TerminalWsClient({
          wsUrl: attach.wsUrl,
          cols: attach.cols,
          rows: attach.rows,
          onData: (data) => {
            termRef.current?.write(new TextDecoder().decode(data));
          },
          onExit: (code) => {
            termRef.current?.writeln(`\r\n${t("terminals.exitedWithCode", { code: String(code) })}`);
          },
          onStatusChange: (s) => {
            if (s === "connecting") setStatus(t("terminals.connecting"));
            else if (s === "open") setStatus("");
            else if (s === "error") setStatus(t("terminals.connectionError"));
            else if (s === "closed") setStatus(t("terminals.disconnected"));
          },
        });
        wsRef.current = client;
        client.connect();

        termRef.current.onData((data) => {
          client.sendInput(data);
        });
      } catch (e: unknown) {
        setStatus(e instanceof Error ? e.message : String(e));
      }
    })();

    return () => {
      cancelled = true;
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [nodeService, session?.sessionId, session?.state, t]);

  if (!session) {
    return (
      <div className="terminal-panel terminal-panel-empty">
        <h3>{t("terminals.selectSession")}</h3>
        <p>{t("terminals.selectSessionDesc")}</p>
      </div>
    );
  }

  if (session.state !== "running") {
    return (
      <div className="terminal-panel terminal-panel-empty">
        <h3>{session.title}</h3>
        <p>{t("terminals.sessionExited")}</p>
      </div>
    );
  }

  return (
    <div className="terminal-panel">
      <div className="terminal-panel-toolbar">
        <span className="terminal-panel-title">{session.title}</span>
        {status ? <span className="terminal-panel-status">{status}</span> : null}
      </div>
      <div className="terminal-panel-xterm" ref={containerRef} />
    </div>
  );
}
