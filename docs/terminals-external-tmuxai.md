# Optional: TmuxAI alongside EnvoyMesh Terminals

EnvoyMesh **Terminal Agent mode** (Slice 3) implements TmuxAI-*inspired* patterns natively: NL→command preview, risk confirm, `/model`, observe loop, numbered plans. [TmuxAI](https://github.com/alvinunreal/tmuxai) is an **optional external tool** for users who already run **tmux on an SSH host**.

## When to use EnvoyMesh Agent bar vs TmuxAI

| EnvoyMesh Terminals + Agent bar | External TmuxAI |
|--------------------------------|-------------------|
| Browser/Tauri/mobile remote UI | tmux session on remote Linux server |
| Home node PTY + direct LLM assist | Requires tmux + TmuxAI install on target |
| OpenClaw `/openclaw` plans on home | Upstream TmuxAI observe/chat panes |

Do **not** nest tmux/TmuxAI inside an EnvoyMesh PTY for AI assist — prefer Agent bar on the EnvoyMesh session or native tmux on the SSH host.

## Install TmuxAI on an SSH host (external)

Requires **tmux** on the target machine. See upstream:

- https://github.com/alvinunreal/tmuxai
- Install script: https://get.tmuxai.dev

Example workflow on a remote server:

```bash
ssh my-server
tmux new -s ops
# inside tmux, follow TmuxAI install/start instructions
```

## EnvoyMesh equivalents (shipped)

| TmuxAI concept | EnvoyMesh |
|----------------|-----------|
| Chat / exec split | Manual vs Agent toggle + Agent bar |
| Confirm before run | Risk-tier preview card + `/confirm` |
| `/model` | `/model` → `terminalSetAssistModelOverride` |
| Observe loop | `/observe`, `/watch`, `terminalObserveStep` |
| Multi-step plan | `/openclaw` + `/step` |
| Read-only context pane | `/pin` → `terminalPinContextSession` |

## Settings guidance

Use **Settings → AI → Terminal assist** for model tier, auto-run policy, and allow/deny/destructive regex lists on the **home node**. TmuxAI uses its own model configuration on the SSH host — keep them separate.

See `docs/implementation-plan.md` §30I (native assist) and §30J for deferred bundling notes.
