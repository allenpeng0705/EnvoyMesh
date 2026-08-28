# Optional: herdr alongside EnvoyMesh Terminals

EnvoyMesh **Phase 30** ships native Terminals in Social (xterm.js + home-node PTY). [herdr](https://github.com/ogulcancelik/herdr) is an **optional external multiplexer** for power users who prefer a native TUI workflow.

## When to use herdr vs EnvoyMesh Terminals

| Use EnvoyMesh Terminals (default) | Consider herdr |
|-----------------------------------|----------------|
| Paired mobile remote shell | Local macOS/Linux power-user tiling |
| Agent bar + home LLM assist | Mouse-native splits outside the browser |
| Same UI as Chat / Assistant | Long-lived agent panes with socket API |

EnvoyMesh does **not** bundle herdr (AGPL-3.0). Session list / detach patterns in Social were inspired by herdr; implementation is native.

## Install (external)

Follow upstream install docs, for example:

```bash
brew install herdr
# or upstream install script from https://github.com/ogulcancelik/herdr
```

## Open workspace from EnvoyMesh (desktop home node)

Settings → AI → **Terminal assist** → **Open workspace in herdr** launches:

```bash
herdr   # cwd = <profile>/openclaw-workspace/
```

Requires `herdr` on PATH. Not available on Windows or mobile wrappers.

## Export terminal scrollback for manual import

RPC `terminalGetHerdrExportHint({ sessionId })` writes scrollback to:

```
<profile>/terminals/herdr-export/<sessionId>.txt
```

Use this for manual copy/import workflows. Programmatic herdr pane injection is **not** wired in v1.

### herdr socket API evaluation

If you set `HERDR_SOCKET` to your herdr control socket path, EnvoyMesh returns a note in the export hint response describing that upstream socket APIs may accept pane content — evaluate against your installed herdr version before automating. EnvoyMesh does not ship a socket bridge.

## Open a workspace pane (manual)

From a shell on your home machine:

```bash
cd ~/path/to/openclaw-workspace
herdr
```

You can also run `ssh`, `npm`, or OpenClaw CLIs inside herdr panes. EnvoyMesh Terminals remain the supported path for **remote phone access** and **Terminal Agent mode**.

See `docs/implementation-plan.md` §30F (session badges) and §30H for roadmap notes.
