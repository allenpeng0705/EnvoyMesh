/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Override default node WebSocket URL in Vite dev (e.g. ws://127.0.0.1:4030/ws). */
  readonly VITE_ENVOYMESH_WS_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
