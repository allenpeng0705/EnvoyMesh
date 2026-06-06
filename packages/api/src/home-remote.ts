/** HomeRemote status for paired mobile clients (Phase 30E). */
export interface HomeRemoteStatus {
  paired: boolean;
  homeOnline: boolean;
  terminalsAvailable: boolean;
}

export interface HomeTerminalWsOpenParams {
  pathWithQuery: string;
}

export interface HomeTerminalWsSendParams {
  dataBase64: string;
}

export interface HomeTerminalWsRpcResult {
  ok: boolean;
  error?: string;
}
