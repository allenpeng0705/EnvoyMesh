import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";

import type { TerminalSessionSummary, TerminalWatchReadyEvent, EhUserQuestionEvent, EhTurnHintsEvent, EhActivityEvent, EhPermissionEvent } from "@envoymesh/api";

import { useNodeState } from "../../context/NodeStateContext.js";
import { useNodeService } from "../../hooks/useNodeService.js";
import { useEhTurnContext } from "../../hooks/useEhTurnContext.js";
import { useT } from "../../context/I18nContext.js";
import {
  HomeRemoteTerminalClient,
  HOME_REMOTE_TERMINAL_TOKEN_REFRESH_MS,
  TerminalWsClient,
  terminalPathFromAttachWsUrl,
  type TerminalTransport,
} from "../../lib/terminal-ws-client.js";
import type { TerminalPanelMode } from "../../lib/terminal-slash-commands.js";
import { TerminalAgentBar, type TerminalAgentBarHandle } from "./TerminalAgentBar.js";
import {
  dismissNestedMultiplexerTip,
  shouldShowNestedMultiplexerTip,
} from "../../lib/terminal-nested-multiplexer-tip.js";
import { EnvoyHarnessEhuiRail } from "../ehui/EnvoyHarnessEhuiRail.js";
import { EhComposerDockStack } from "../ehui/EhComposerDockStack.js";
import { EhStillWorkingIndicator } from "../ehui/EhStillWorkingIndicator.js";
import { EhuiPanelModal } from "@envoymesh/envoy-harness-ehui";
import { createRemoteEhuiDataSource } from "../../lib/envoy-harness-ehui-data-source.js";

interface TerminalPanelProps {
  session: TerminalSessionSummary | null;
  onOpenAssistant?: () => void;
  active?: boolean;
}

function appendToLineBuffer(buffer: string, data: string): { line: string; reset: boolean } {
  let line = buffer;
  for (const ch of data) {
    const code = ch.charCodeAt(0);
    if (ch === "\r" || ch === "\n") {
      return { line: "", reset: true };
    }
    if (code === 127 || code === 8) {
      line = line.slice(0, -1);
      continue;
    }
    if (code >= 32) {
      line += ch;
    }
  }
  return { line, reset: false };
}

export function TerminalPanel({ session, onOpenAssistant, active = true }: TerminalPanelProps) {
  const nodeService = useNodeService();
  const { connectionStatus } = useNodeState();
  const t = useT();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const execContainerRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const execTermRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const execFitRef = useRef<FitAddon | null>(null);
  const transportRef = useRef<TerminalTransport | null>(null);
  const execTransportRef = useRef<TerminalTransport | null>(null);
  const lineBufferRef = useRef("");
  const agentBarRef = useRef<TerminalAgentBarHandle | null>(null);
  const suggestTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [status, setStatus] = useState<string>("");
  const [mode, setMode] = useState<TerminalPanelMode>("manual");
  const [inlineSuggestEnabled, setInlineSuggestEnabled] = useState(false);
  const [xtermSlashIntercept, setXtermSlashIntercept] = useState(false);
  const [execPaneEnabled, setExecPaneEnabled] = useState(false);
  const [execSessionId, setExecSessionId] = useState<string | null>(null);
  const [watchToast, setWatchToast] = useState<string | null>(null);
  const [bootstrapPrompt, setBootstrapPrompt] = useState<string | null>(null);
  const [ghostSuggestion, setGhostSuggestion] = useState("");
  const [showNestedMultiplexerTip, setShowNestedMultiplexerTip] = useState(false);
  const [pinnedContextSessionId, setPinnedContextSessionId] = useState<string | null>(null);
  const [pinPreviewScrollback, setPinPreviewScrollback] = useState("");
  const [pendingEhQuestion, setPendingEhQuestion] = useState<EhUserQuestionEvent | null>(
    null,
  );
  const [pendingEhPermission, setPendingEhPermission] = useState<EhPermissionEvent | null>(
    null,
  );
  const [ehTurnHints, setEhTurnHints] = useState<EhTurnHintsEvent | null>(null);
  const [ehPromptBusy, setEhPromptBusy] = useState(false);
  const [ehActivitySummary, setEhActivitySummary] = useState<string | undefined>(
    undefined,
  );
  const [ehProjectCwd, setEhProjectCwd] = useState<string | undefined>(undefined);
  const [showGitDiffReview, setShowGitDiffReview] = useState(false);
  const [dismissedChanges, setDismissedChanges] = useState(false);
  const [ehuiRefreshKey, setEhuiRefreshKey] = useState(0);
  /** The Envoy chat thread that owns this project (parallel per-chat turns). */
  const [terminalChatId, setTerminalChatId] = useState<string | null>(null);
  const useHomeRemote = connectionStatus?.homeRemote?.paired === true;
  const homeOffline = useHomeRemote && connectionStatus?.homeRemote?.homeOnline === false;
  const modeRef = useRef(mode);
  const xtermSlashInterceptRef = useRef(xtermSlashIntercept);
  const xtermCleanupRef = useRef<(() => void) | null>(null);
  const onDataDisposableRef = useRef<{ dispose: () => void } | null>(null);
  const reattachAttemptsRef = useRef(0);
  const reconnectingRef = useRef(false);
  const tokenRefreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [xtermReady, setXtermReady] = useState(false);
  const sessionReady = Boolean(session && session.state === "running" && !homeOffline);
  const isPiSession = session?.role === "pi";
  const isEnvoyHarnessSession = session?.role === "envoy-harness";

  const turnContext = useEhTurnContext({
    projectCwd: ehProjectCwd,
    chatId: terminalChatId,
    subscribeActivity: (handler) => nodeService.on("eh:activity", handler),
    subscribeFilesChanged: (handler) => nodeService.on("eh:files_changed", handler),
  });
  const resetTurnContext = turnContext.resetTurnContext;

  const ehuiDataSource = useMemo(
    () => createRemoteEhuiDataSource(nodeService),
    [nodeService],
  );

  useEffect(() => {
    if (!isEnvoyHarnessSession) {
      setEhProjectCwd(undefined);
      setTerminalChatId(null);
      return;
    }
    void nodeService.getEnvoyHarnessStatus().then((s) => {
      setEhProjectCwd(s.cwd);
    });
  }, [isEnvoyHarnessSession, nodeService]);

  // Resolve the chat thread for this terminal's project folder so the
  // progress rail only shows this project's turns (other chats may run
  // in parallel).
  useEffect(() => {
    if (!isEnvoyHarnessSession || !ehProjectCwd) {
      setTerminalChatId(null);
      return;
    }
    if (typeof nodeService.listEnvoyHarnessChats !== "function") {
      setTerminalChatId(null);
      return;
    }
    let cancelled = false;
    const normalize = (p: string) => p.replace(/[/\\]+$/, "");
    void nodeService
      .listEnvoyHarnessChats()
      .then((chats) => {
        if (cancelled) return;
        const match = chats.find(
          (c) => normalize(c.cwd) === normalize(ehProjectCwd ?? ""),
        );
        setTerminalChatId(match?.id ?? null);
      })
      .catch(() => {
        if (!cancelled) setTerminalChatId(null);
      });
    return () => {
      cancelled = true;
    };
  }, [ehProjectCwd, isEnvoyHarnessSession, nodeService]);

  const matchesTerminalChat = (eventChatId: string | undefined): boolean =>
    eventChatId === undefined || eventChatId === terminalChatId;

  useEffect(() => {
    if (!isEnvoyHarnessSession) {
      setPendingEhQuestion(null);
      setPendingEhPermission(null);
      setEhTurnHints(null);
      setEhPromptBusy(false);
      setDismissedChanges(false);
      resetTurnContext();
      return;
    }
    const unsubQuestion = nodeService.on("eh:user_question", (event) => {
      if (!matchesTerminalChat(event.chatId)) return;
      setPendingEhQuestion(event);
    });
    const unsubPermission = nodeService.on("eh:permission", (event) => {
      if (!matchesTerminalChat(event.chatId)) return;
      setPendingEhPermission(event);
    });
    const unsubHints = nodeService.on("eh:turn_hints", (event) => {
      if (!matchesTerminalChat(event.chatId)) return;
      setEhTurnHints(event);
    });
    const unsubBusy = nodeService.on("eh:prompt_busy", (event) => {
      if (!matchesTerminalChat(event.chatId)) return;
      setEhPromptBusy(event.busy);
      if (!event.busy) {
        setEhActivitySummary(undefined);
        setPendingEhQuestion(null);
        setPendingEhPermission(null);
        setEhuiRefreshKey((k) => k + 1);
      }
    });
    const unsubTurnStart = nodeService.on("eh:turn_started", (event) => {
      if (!matchesTerminalChat(event.chatId)) return;
      setDismissedChanges(false);
      resetTurnContext();
    });
    const unsubActivity = nodeService.on("eh:activity", (event: EhActivityEvent) => {
      if (!matchesTerminalChat(event.chatId)) return;
      if (event.summary.trim().length > 0) {
        setEhActivitySummary(event.summary);
      }
    });
    return () => {
      unsubQuestion();
      unsubPermission();
      unsubHints();
      unsubBusy();
      unsubTurnStart();
      unsubActivity();
    };
  }, [nodeService, isEnvoyHarnessSession, resetTurnContext, terminalChatId]);

  useEffect(() => {
    if (isPiSession && mode !== "manual") setMode("manual");
  }, [isPiSession, mode]);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    xtermSlashInterceptRef.current = xtermSlashIntercept;
  }, [xtermSlashIntercept]);

  const fitTerminal = useCallback(() => {
    const term = termRef.current;
    const fit = fitRef.current;
    const container = containerRef.current;
    if (!term || !fit || !container) return;
    if (container.clientWidth <= 0 || container.clientHeight <= 0) return;
    fit.fit();
    transportRef.current?.sendResize(term.cols, term.rows);
  }, []);

  useEffect(() => {
    if (!active || !xtermReady) return;
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => fitTerminal());
    });
    return () => cancelAnimationFrame(id);
  }, [active, fitTerminal, session?.sessionId, session?.state, xtermReady]);

  const mountXterm = useCallback(
    (container: HTMLDivElement) => {
      if (termRef.current) {
        fitTerminal();
        return;
      }
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
      term.open(container);
      termRef.current = term;
      fitRef.current = fit;

      const onResize = () => {
        fit.fit();
        transportRef.current?.sendResize(term.cols, term.rows);
      };
      window.addEventListener("resize", onResize);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => fit.fit());
      });
      setXtermReady(true);

      xtermCleanupRef.current = () => {
        window.removeEventListener("resize", onResize);
        onDataDisposableRef.current?.dispose();
        onDataDisposableRef.current = null;
        transportRef.current?.close();
        transportRef.current = null;
        term.dispose();
        termRef.current = null;
        fitRef.current = null;
        setXtermReady(false);
      };
    },
    [fitTerminal],
  );

  const containerCallbackRef = useCallback(
    (node: HTMLDivElement | null) => {
      containerRef.current = node;
      if (!node) {
        xtermCleanupRef.current?.();
        xtermCleanupRef.current = null;
        return;
      }
      mountXterm(node);
    },
    [mountXterm],
  );

  useEffect(() => {
    if (!containerRef.current || !xtermReady) return;
    const observer = new ResizeObserver(() => fitTerminal());
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [fitTerminal, xtermReady]);

  useEffect(() => {
    return () => {
      xtermCleanupRef.current?.();
      xtermCleanupRef.current = null;
    };
  }, []);

  useEffect(() => {
    const term = termRef.current;
    if (!term || !session?.sessionId) return;
    term.options.disableStdin = mode === "agent";
    if (mode !== "agent") {
      term.focus();
    }
  }, [mode, session?.sessionId, xtermReady]);

  useEffect(() => {
    // Lazy-create the exec-pane Terminal. Previously this ran on every
    // mount and constructed a second xterm + FitAddon + DOM canvas
    // even when execPaneEnabled was false (the default — the pane is
    // hidden until the owner explicitly turns it on). Construction is
    // non-trivial (DOM + WebGL probe + initial paint) so skipping it
    // when not in use is a measurable win on Terminals-tab open. We
    // still construct the underlying <div ref={execContainerRef}> so
    // re-enabling later has a place to mount.
    if (!execPaneEnabled) return;
    if (!execContainerRef.current) return;

    const term = new Terminal({
      cursorBlink: false,
      disableStdin: true,
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
      fontSize: 12,
      theme: {
        background: "#0a0e14",
        foreground: "#8b949e",
      },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(execContainerRef.current);
    fit.fit();
    execTermRef.current = term;
    execFitRef.current = fit;

    return () => {
      execTransportRef.current?.close();
      execTransportRef.current = null;
      term.dispose();
      execTermRef.current = null;
      execFitRef.current = null;
    };
  }, [execPaneEnabled]);

  useEffect(() => {
    void nodeService.getNodeConfig().then((cfg) => {
      setXtermSlashIntercept(cfg.terminalXtermSlashIntercept ?? false);
    }).catch(() => {
      //
    });
  }, [nodeService]);

  useEffect(() => {
    if (!session?.sessionId) return;
    const handler = (event: TerminalWatchReadyEvent) => {
      if (event.sessionId !== session.sessionId) return;
      setWatchToast(t("terminals.agent.watchReadyToast", { goal: event.goal }));
      if (event.proposal) {
        setMode("agent");
      }
    };
    return nodeService.on("terminal:watch-ready", handler);
  }, [nodeService, session?.sessionId, t]);

  useEffect(() => {
    setMode("manual");
    setGhostSuggestion("");
    lineBufferRef.current = "";
    if (!session?.sessionId) return;
    void nodeService.terminalGetAssistState(session.sessionId).then((state) => {
      setInlineSuggestEnabled(state.inlineSuggestEnabled ?? false);
      setExecPaneEnabled(state.execPaneEnabled ?? false);
      setExecSessionId(state.execSessionId ?? null);
    }).catch(() => {
      //
    });
  }, [nodeService, session?.sessionId]);

  useEffect(() => {
    if (!session?.sessionId) {
      setPinnedContextSessionId(null);
      setPinPreviewScrollback("");
      return;
    }
    let cancelled = false;
    const loadPin = () => {
      void nodeService.terminalGetAssistState(session.sessionId).then((state) => {
        if (!cancelled) {
          setPinnedContextSessionId(state.pinnedContextSessionId ?? null);
        }
      }).catch(() => {
        if (!cancelled) setPinnedContextSessionId(null);
      });
    };
    loadPin();
    const id = setInterval(loadPin, 5000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [nodeService, session?.sessionId]);

  useEffect(() => {
    if (!session?.sessionId) {
      setExecPaneEnabled(false);
      setExecSessionId(null);
      return;
    }
    let cancelled = false;
    const loadExec = () => {
      void nodeService.terminalGetAssistState(session.sessionId).then((state) => {
        if (!cancelled) {
          setExecPaneEnabled(state.execPaneEnabled ?? false);
          setExecSessionId(state.execSessionId ?? null);
        }
      }).catch(() => {
        if (!cancelled) {
          setExecPaneEnabled(false);
          setExecSessionId(null);
        }
      });
    };
    loadExec();
    const id = setInterval(loadExec, 3000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [nodeService, session?.sessionId]);

  useEffect(() => {
    if (!pinnedContextSessionId) {
      setPinPreviewScrollback("");
      return;
    }
    let cancelled = false;
    const loadPreview = () => {
      void nodeService
        .terminalGetScrollbackPreview({ sessionId: pinnedContextSessionId, maxBytes: 6000 })
        .then((result) => {
          if (!cancelled) setPinPreviewScrollback(result.scrollback);
        })
        .catch(() => {
          if (!cancelled) setPinPreviewScrollback("");
        });
    };
    loadPreview();
    const id = setInterval(loadPreview, 3000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [nodeService, pinnedContextSessionId]);

  useEffect(() => {
    if (mode !== "manual" || !session?.sessionId) return;
    void nodeService
      .terminalGetAssistState(session.sessionId)
      .then((state) => setInlineSuggestEnabled(state.inlineSuggestEnabled ?? false))
      .catch(() => {
        //
      });
  }, [mode, nodeService, session?.sessionId]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.shiftKey && e.key.toLowerCase() === "a") {
        e.preventDefault();
        setMode((prev) => (prev === "manual" ? "agent" : "manual"));
      }
      if (mode === "agent" && e.key === "Escape") {
        e.preventDefault();
        setMode("manual");
      }
      if (
        mode === "manual" &&
        inlineSuggestEnabled &&
        ghostSuggestion &&
        e.key === "Tab" &&
        !(e.target instanceof HTMLInputElement)
      ) {
        e.preventDefault();
        transportRef.current?.sendInput(ghostSuggestion);
        lineBufferRef.current += ghostSuggestion;
        setGhostSuggestion("");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [ghostSuggestion, inlineSuggestEnabled, mode]);

  const queueSuggest = useCallback(
    (partialInput: string) => {
      if (!session?.sessionId || !inlineSuggestEnabled || mode !== "manual") {
        setGhostSuggestion("");
        return;
      }
      if (suggestTimerRef.current) {
        clearTimeout(suggestTimerRef.current);
      }
      if (partialInput.trim().length < 2) {
        setGhostSuggestion("");
        return;
      }
      suggestTimerRef.current = setTimeout(() => {
        void nodeService
          .terminalSuggestCommand({ sessionId: session.sessionId, partialInput })
          .then((result) => {
            const completion = result.completion ?? result.suggestions[0] ?? "";
            if (!completion || completion === partialInput) {
              setGhostSuggestion("");
              return;
            }
            setGhostSuggestion(completion.startsWith(partialInput) ? completion.slice(partialInput.length) : completion);
          })
          .catch(() => setGhostSuggestion(""));
      }, 350);
    },
    [inlineSuggestEnabled, mode, nodeService, session?.sessionId],
  );

  useEffect(() => {
    transportRef.current?.close();
    transportRef.current = null;
    termRef.current?.reset();
    setStatus("");
    setGhostSuggestion("");
    lineBufferRef.current = "";
    setShowNestedMultiplexerTip(false);
    reattachAttemptsRef.current = 0;
    reconnectingRef.current = false;
    if (tokenRefreshTimerRef.current) {
      clearInterval(tokenRefreshTimerRef.current);
      tokenRefreshTimerRef.current = null;
    }

    if (!sessionReady || !xtermReady) {
      return;
    }

    let cancelled = false;
    const isCancelled = () => cancelled;

    const scheduleReattach = () => {
      if (isCancelled() || reconnectingRef.current || !useHomeRemote) return;
      if (reattachAttemptsRef.current >= 5) {
        setStatus(t("terminals.disconnected"));
        return;
      }
      reconnectingRef.current = true;
      reattachAttemptsRef.current += 1;
      setStatus(t("terminals.reconnecting"));
      const delayMs = Math.min(500 * reattachAttemptsRef.current, 3000);
      setTimeout(() => {
        if (isCancelled()) return;
        void connectTransport().finally(() => {
          reconnectingRef.current = false;
        });
      }, delayMs);
    };

    const connectTransport = async (): Promise<void> => {
      if (isCancelled() || !termRef.current || !session?.sessionId) return;
      transportRef.current?.close();
      transportRef.current = null;
      termRef.current.reset();

      const attach = await nodeService.terminalAttach({
        sessionId: session.sessionId,
        cols: termRef.current.cols,
        rows: termRef.current.rows,
      });
      if (isCancelled() || !termRef.current) return;

      const noteNestedMultiplexer = (text: string) => {
        if (shouldShowNestedMultiplexerTip(text)) {
          setShowNestedMultiplexerTip(true);
        }
      };

      const callbacks = {
        cols: attach.cols,
        rows: attach.rows,
        onData: (data: Uint8Array) => {
          const decoded = new TextDecoder().decode(data);
          termRef.current?.write(decoded);
          noteNestedMultiplexer(decoded);
        },
        onExit: (code: number) => {
          termRef.current?.writeln(`\r\n${t("terminals.exitedWithCode", { code: String(code) })}`);
        },
        onStatusChange: (s: "connecting" | "open" | "closed" | "error") => {
          if (s === "connecting") setStatus(t("terminals.connecting"));
          else if (s === "open") {
            reattachAttemptsRef.current = 0;
            setStatus(useHomeRemote ? t("terminals.runningOnHome") : "");
          } else if (s === "error") setStatus(t("terminals.connectionError"));
          else if (s === "closed") setStatus(t("terminals.disconnected"));
        },
      };

      let transport: TerminalTransport;
      if (useHomeRemote) {
        transport = new HomeRemoteTerminalClient({
          ...callbacks,
          sessionId: session.sessionId,
          pathWithQuery: terminalPathFromAttachWsUrl(attach.wsUrl),
          homeTerminalWsOpen: (params) => nodeService.homeTerminalWsOpen(params),
          homeTerminalWsSend: (params) => nodeService.homeTerminalWsSend(params),
          homeTerminalWsClose: (params) => nodeService.homeTerminalWsClose(params),
          subscribeRx: (handler) => nodeService.on("homeTerminalWs:rx", handler),
          subscribeClosed: (handler) => nodeService.on("homeTerminalWs:closed", handler),
          onTunnelClosed: scheduleReattach,
          onSendError: (msg) => {
            setStatus(msg === "homeRemote.notConnected" ? t("terminals.homeOffline") : msg);
            scheduleReattach();
          },
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
      fitTerminal();
    };

    void connectTransport().catch((e: unknown) => {
      const msg = e instanceof Error ? e.message : String(e);
      setStatus(msg === "homeRemote.offline" ? t("terminals.homeOffline") : msg);
    });

    if (useHomeRemote) {
      tokenRefreshTimerRef.current = setInterval(() => {
        if (isCancelled() || reconnectingRef.current) return;
        setStatus(t("terminals.reconnecting"));
        void connectTransport().catch(() => {
          setStatus(t("terminals.disconnected"));
        });
      }, HOME_REMOTE_TERMINAL_TOKEN_REFRESH_MS);
    }

    return () => {
      cancelled = true;
      if (suggestTimerRef.current) clearTimeout(suggestTimerRef.current);
      if (tokenRefreshTimerRef.current) {
        clearInterval(tokenRefreshTimerRef.current);
        tokenRefreshTimerRef.current = null;
      }
      transportRef.current?.close();
      transportRef.current = null;
    };
  }, [fitTerminal, homeOffline, nodeService, session?.sessionId, sessionReady, t, useHomeRemote, xtermReady]);

  useEffect(() => {
    if (!xtermReady || !sessionReady) return;
    const term = termRef.current;
    if (!term) return;

    onDataDisposableRef.current?.dispose();
    onDataDisposableRef.current = term.onData((data) => {
      const transport = transportRef.current;
      if (!transport) return;

      if (shouldShowNestedMultiplexerTip(data)) {
        setShowNestedMultiplexerTip(true);
      }

      const prevLine = lineBufferRef.current;
      const { line, reset } = appendToLineBuffer(prevLine, data);

      if (reset) {
        lineBufferRef.current = "";
        setGhostSuggestion("");
        const trimmed = prevLine.trim();
        if (
          modeRef.current === "manual" &&
          xtermSlashInterceptRef.current &&
          /^\/envoy(\s|$)/i.test(trimmed)
        ) {
          const prompt = trimmed.replace(/^\/envoy\s*/i, "").trim();
          if (prompt) {
            transport.sendInput("\x15");
            setMode("agent");
            setBootstrapPrompt(prompt);
            return;
          }
        }
        transport.sendInput(data);
        return;
      }

      lineBufferRef.current = line;
      transport.sendInput(data);
      queueSuggest(lineBufferRef.current);
    });

    return () => {
      onDataDisposableRef.current?.dispose();
      onDataDisposableRef.current = null;
    };
  }, [queueSuggest, session?.sessionId, sessionReady, xtermReady]);

  useEffect(() => {
    execTransportRef.current?.close();
    execTransportRef.current = null;
    execTermRef.current?.reset();

    if (!execPaneEnabled || !execSessionId || homeOffline || session?.state !== "running") {
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const attach = await nodeService.terminalAttach({
          sessionId: execSessionId,
          cols: execTermRef.current?.cols ?? 80,
          rows: execTermRef.current?.rows ?? 12,
        });
        if (cancelled || !execTermRef.current) return;

        const callbacks = {
          cols: attach.cols,
          rows: attach.rows,
          onData: (data: Uint8Array) => {
            execTermRef.current?.write(new TextDecoder().decode(data));
          },
          onExit: (code: number) => {
            execTermRef.current?.writeln(`\r\n[exec exited ${code}]`);
          },
          onStatusChange: () => {
            //
          },
        };

        let transport: TerminalTransport;
        if (useHomeRemote) {
          transport = new HomeRemoteTerminalClient({
            ...callbacks,
            sessionId: execSessionId,
            pathWithQuery: terminalPathFromAttachWsUrl(attach.wsUrl),
            homeTerminalWsOpen: (params) => nodeService.homeTerminalWsOpen(params),
            homeTerminalWsSend: (params) => nodeService.homeTerminalWsSend(params),
            homeTerminalWsClose: (params) => nodeService.homeTerminalWsClose(params),
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

        execTransportRef.current = transport;
        execFitRef.current?.fit();
      } catch {
        //
      }
    })();

    return () => {
      cancelled = true;
      execTransportRef.current?.close();
      execTransportRef.current = null;
    };
  }, [execPaneEnabled, execSessionId, homeOffline, nodeService, session?.state, useHomeRemote]);

  const dismissNestedMultiplexerTipHandler = useCallback(() => {
    dismissNestedMultiplexerTip();
    setShowNestedMultiplexerTip(false);
  }, []);

  const editInTerminal = useCallback((command: string) => {
    termRef.current?.focus();
    transportRef.current?.sendInput(command);
    lineBufferRef.current = command;
  }, []);

  const emptyMessage = !session
    ? { title: t("terminals.selectSession"), desc: t("terminals.selectSessionDesc") }
    : homeOffline
      ? { title: session.title, desc: t("terminals.homeOffline") }
      : session.state !== "running"
        ? { title: session.title, desc: t("terminals.sessionExited") }
        : null;

  return (
    <div className="terminal-panel">
      <div className="terminal-panel-main">
      {isEnvoyHarnessSession && sessionReady ? (
        <EnvoyHarnessEhuiRail
          className="eh-ehui-command-bar terminal-ehui-command-bar contact-web-content__actions contact-web-content__actions--links"
        />
      ) : null}
      <div className="terminal-panel-toolbar">
        <span className="terminal-panel-title">{session?.title ?? t("terminals.selectSession")}</span>
        {sessionReady && !isPiSession && !isEnvoyHarnessSession ? (
          <div className="terminal-mode-toggle" role="tablist" aria-label={t("terminals.agent.modeLabel")}>
            <button
              type="button"
              className={mode === "manual" ? "active" : ""}
              onClick={() => setMode("manual")}
            >
              {t("terminals.agent.manual")}
            </button>
            <button
              type="button"
              className={mode === "agent" ? "active" : ""}
              onClick={() => setMode("agent")}
            >
              {t("terminals.agent.agent")}
            </button>
          </div>
        ) : null}
        {isPiSession ? <span className="terminal-panel-badge">{t("pi.title", "Pi")}</span> : null}
        {useHomeRemote ? <span className="terminal-panel-badge">{t("terminals.runningOnHome")}</span> : null}
        {status ? <span className="terminal-panel-status">{status}</span> : null}
      </div>
      {showNestedMultiplexerTip && sessionReady ? (
        <div className="terminal-nested-multiplexer-tip" role="status">
          <p>{t("terminals.nestedMultiplexerTip")}</p>
          <button type="button" className="secondary" onClick={dismissNestedMultiplexerTipHandler}>
            {t("terminals.nestedMultiplexerDismiss")}
          </button>
        </div>
      ) : null}
      {watchToast && sessionReady ? (
        <div className="terminal-watch-toast" role="status">
          <span>{watchToast}</span>
          <button type="button" className="secondary" onClick={() => setWatchToast(null)}>
            {t("terminals.nestedMultiplexerDismiss")}
          </button>
        </div>
      ) : null}
      {pinnedContextSessionId && pinPreviewScrollback && sessionReady ? (
        <div className="terminal-pin-preview">
          <div className="terminal-pin-preview-header">
            {t("terminals.agent.pinPreviewTitle")} · {pinnedContextSessionId.slice(0, 8)}…
          </div>
          <pre className="terminal-pin-preview-body">{pinPreviewScrollback}</pre>
        </div>
      ) : null}
      {isEnvoyHarnessSession && sessionReady && (ehPromptBusy || pendingEhQuestion) ? (
        <EhStillWorkingIndicator
          active={ehPromptBusy || pendingEhQuestion !== null}
          waitingForUser={pendingEhQuestion !== null}
          activitySummary={ehActivitySummary}
          activityLog={turnContext.activityLog}
          onCancel={() => {
            void nodeService.cancelEnvoyHarnessTurn();
          }}
          className="terminal-eh-still-working"
        />
      ) : null}
      {isEnvoyHarnessSession && sessionReady ? (
        <div className="terminal-eh-dock-stack">
        <EhComposerDockStack
          permission={pendingEhPermission}
          onPermissionDismiss={() => setPendingEhPermission(null)}
          question={pendingEhQuestion}
          onQuestionDismiss={() => setPendingEhQuestion(null)}
          turnHints={ehTurnHints}
          onTurnHintsDismiss={() => setEhTurnHints(null)}
          onSelectFollowUp={(text) => {
            transportRef.current?.sendInput(`${text}\n`);
            setEhTurnHints(null);
          }}
          queue={[]}
          onQueueUpdate={() => {}}
          onQueueRemove={() => {}}
          contextFiles={turnContext.touchedFiles}
          changedFiles={dismissedChanges ? [] : turnContext.touchedFiles}
          onReviewChanges={() => setShowGitDiffReview(true)}
          onDismissChanges={() => setDismissedChanges(true)}
        />
        </div>
      ) : null}
      <div className="terminal-panel-xterm-wrap">
        <div className="terminal-panel-xterm" ref={containerCallbackRef} />
        {emptyMessage ? (
          <div className="terminal-panel-empty-overlay" aria-live="polite">
            <h3>{emptyMessage.title}</h3>
            <p>{emptyMessage.desc}</p>
          </div>
        ) : null}
      </div>
      {sessionReady && !isPiSession && !isEnvoyHarnessSession ? (
        <TerminalAgentBar
          ref={agentBarRef}
          sessionId={session!.sessionId}
          mode={mode}
          onModeChange={setMode}
          onEditInTerminal={editInTerminal}
          onOpenAssistant={onOpenAssistant}
          bootstrapPrompt={bootstrapPrompt}
          onBootstrapPromptConsumed={() => setBootstrapPrompt(null)}
        />
      ) : null}
      {execPaneEnabled && execSessionId && sessionReady ? (
        <div className="terminal-exec-pane">
          <div className="terminal-exec-pane-header">{t("terminals.agent.execPaneTitle")}</div>
          <div className="terminal-exec-pane-xterm" ref={execContainerRef} />
        </div>
      ) : (
        <div className="terminal-exec-pane-xterm" ref={execContainerRef} hidden aria-hidden />
      )}
      {sessionReady && mode === "manual" && inlineSuggestEnabled && ghostSuggestion ? (
        <div className="terminal-suggest-ghost">
          <span className="terminal-suggest-label">{t("terminals.agent.suggestHint")}</span>
          <code>{ghostSuggestion}</code>
          <span className="terminal-suggest-tab">{t("terminals.agent.suggestTab")}</span>
        </div>
      ) : null}
      {showGitDiffReview ? (
        <EhuiPanelModal
          panel="git-diff"
          dataSource={ehuiDataSource}
          refreshKey={ehuiRefreshKey}
          onClose={() => setShowGitDiffReview(false)}
          overlayClassName="modal-overlay"
          panelClassName="modal-panel eh-ehui-modal-panel"
          closeButtonClassName="modal-close"
          actionButtonClassName="pi-chat-restart-btn"
          primaryActionButtonClassName="pi-chat-send"
          inputClassName="pi-chat-input eh-ehui-field"
        />
      ) : null}
      </div>
    </div>
  );
}
