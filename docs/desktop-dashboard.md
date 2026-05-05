# Desktop UI: Tauri wraps the Social web app

End users normally run **`apps/tauri`**: a **native window whose content is the same Social frontend** (`apps/social`) you develop in the browser—HTML/CSS/JS loaded from built static assets. Tauri also **spawns the Node** runtime (`apps/node`) so mesh + WebSocket API are local to the machine.

Two ways to work:

- **Production-like / end users**: `npm run tauri:dev` / `npm run tauri:build`. Profile for the spawned node defaults under OS app-data (see `apps/tauri/src-tauri/src/main.rs`).
- **Developers**: `npm run node:dev` (`--profile` / env as needed) plus `npm run social:dev` to hit the WebSocket API from the Vite dev server.

The retired **Electron** operator app (`apps/desktop`) is gone; extend **Social** for new graphical features instead of rebuilding a second desktop stack.
