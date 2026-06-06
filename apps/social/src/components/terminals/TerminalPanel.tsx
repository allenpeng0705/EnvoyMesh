import { useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";

import type { TerminalSessionSummary } from "@envoymesh/api";

import { useNodeState } from "../../context/NodeStateContext.js";
import { useNodeService } from "../../hooks/useNodeService.js";
import { useT } from "../../context/I18nContext.js";
import {
  HomeRemoteTerminalClient,
  TerminalWsClient,
  terminalPathFromAttachWsUrl,
  type TerminalTransport,
} from "../../lib/terminal-ws-client.js";

interface TerminalPanelProps {
  session: TerminalSessionSummary | null;
}

export function TerminalPanel({ session }: TerminalPanelProps) {
  const nodeService = useNodeService();
  const { connectionStatus } = useNodeState();
  const t = useT();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const transportRef = useRef<TerminalTransport | null>(null);
  const [status, setStatus] = useState<string>("");
  const useHomeRemote = connectionStatus?.homeRemote?.paired === true;
  const homeOffline = useHomeRemote && connectionStatus?.homeRemote?.homeOnline === false;

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
      transportRef.current?.sendResize(term.cols, term.rows);
    };
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      transportRef.current?.close();
      transportRef.current = null;
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
  }, []);

  useEffect(() => {
    transportRef.current?.close();
    transportRef.current = null;
    termRef.current?.reset();
    setStatus("");

    if (!session || session.state !== "running" || homeOffline) {
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

        const callbacks = {
          cols: attach.cols,
          rows: attach.rows,
          onData: (data: Uint8Array) => {
            termRef.current?.write(new TextDecoder().decode(data));
          },
          onExit: (code: number) => {
            termRef.current?.writeln(`\r\n${t("terminals.exitedWithCode", { code: String(code) })}`);
          },
          onStatusChange: (s: "connecting" | "open" | "closed" | "error") => {
            if (s === "connecting") setStatus(t("terminals.connecting"));
            else if (s === "open") setStatus(useHomeRemote ? t("terminals.runningOnHome") : "");
            else if (s === "error") setStatus(t("terminals.connectionError"));
            else if (s === "closed") setStatus(t("terminals.disconnected"));
          },
        };

        let transport: TerminalTransport;
        if (useHomeRemote) {
          transport = new HomeRemoteTerminalClient({
            ...callbacks,
            pathWithQuery: terminalPathFromAttachWsUrl(attach.wsUrl),
            homeTerminalWsOpen: (params) => nodeService.homeTerminalWsOpen(params),
            homeTerminalWsSend: (params) => nodeService.homeTerminalWsSend(params),
            homeTerminalWsClose: () => nodeService.homeTerminalWsClose(),
            subscribeRx: (handler) => nodeService.on("homeTerminalWs:rx", handler),
            subscribeClosed: (handler) => nodeService.on("homeTerminalWs:closed", handler),
          });
          await transport.connect();
        } else {
          transport = new TerminalWsClient({
            ...callbacks,
            wsUrl: attach.wsUrl,
          });
          transport.connect();
        }

        transportRef.current = transport;
        termRef.current.onData((data) => {
          transport.sendInput(data);
        });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        setStatus(msg === "homeRemote.offline" ? t("terminals.homeOffline") : msg);
      }
    })();

    return () => {
      cancelled = true;
      transportRef.current?.close();
      transportRef.current = null;
    };
  }, [homeOffline, nodeService, session?.sessionId, session?.state, t, useHomeRemote]);

  if (!session) {
    return (
      <div className="terminal-panel terminal-panel-empty">
        <h3>{t("terminals.selectSession")}</h3>
        <p>{t("terminals.selectSessionDesc")}</p>
      </div>
    );
  }

  if (homeOffline) {
    return (
      <div className="terminal-panel terminal-panel-empty">
        <h3>{session.title}</h3>
        <p>{t("terminals.homeOffline")}</p>
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
        {useHomeRemote ? <span className="terminal-panel-badge">{t("terminals.runningOnHome")}</span> : null}
        {status ? <span className="terminal-panel-status">{status}</span> : null}
      </div>
      <div className="terminal-panel-xterm" ref={containerRef} />
    </div>
  );
}
