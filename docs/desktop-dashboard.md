# Desktop dashboard (Electron path — retired)

The previous **Electron + Vite operator console** under `apps/desktop` has been removed. Day-to-day UI is the **Social** app (`apps/social`), with an optional native shell:

- **Browser + Node**: run `npm run node:dev` (WebSocket on `:3030`) and `npm run social:dev`, then open the Vite URL.
- **Native shell**: `apps/tauri` loads the built Social UI (`npm run social:build`) and spawns the compiled Node entrypoint (`npm run node:build`). See root `npm run tauri:dev` / `npm run tauri:build`.

Tauri resolves profile data under its app-data directory (`ENVOYMESH_PROFILE` override is still respected when spawning Node—see `apps/tauri/src-tauri/src/main.rs`).

The old Electron-specific preload / IPC assumptions do not apply. For parity features (relay panels, dashboards), prefer extending Social + Node over reviving Electron.
