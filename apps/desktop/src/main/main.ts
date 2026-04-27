import {
  createDashboardConfig,
  exportPairingTimeline,
  getDashboardSnapshot,
  removeTrustRecord,
  sendChatMessage,
  sendPairingRequest,
  sendTaskNegotiate,
  sendTaskProposal,
  searchSharedVault,
  setTrustRecord,
  updateApprovalStatus,
} from "./dashboard-service.js";
import { app, BrowserWindow, ipcMain } from "electron";
import { join } from "node:path";
import type { SetTrustRecordRequest } from "../shared/dashboard.js";

let config = createDashboardConfig();

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1280,
    height: 900,
    minWidth: 1024,
    minHeight: 720,
    title: "EnvoyMesh Dashboard",
    webPreferences: {
      preload: join(__dirname, "../preload/preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  void window.loadFile(join(__dirname, "../renderer/index.html"));
}

app.whenReady().then(() => {
  applyPackagedDefaults();
  config = createDashboardConfig();
  registerIpcHandlers();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

function applyPackagedDefaults(): void {
  if (!app.isPackaged) {
    return;
  }

  if (!process.env.ENVOYMESH_PROFILE) {
    process.env.ENVOYMESH_PROFILE = join(app.getPath("userData"), "profile");
  }

  if (!process.env.ENVOYMESH_VAULT) {
    process.env.ENVOYMESH_VAULT = join(app.getPath("userData"), "shared_vault");
  }
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

function registerIpcHandlers(): void {
  ipcMain.handle("dashboard:get-config", () => config);
  ipcMain.handle("dashboard:get-snapshot", () => getDashboardSnapshot(config));
  ipcMain.handle("dashboard:approve-request", async (_event, approvalId: string) =>
    updateApprovalStatus(config, approvalId, "approved"),
  );
  ipcMain.handle("dashboard:reject-request", async (_event, approvalId: string) =>
    updateApprovalStatus(config, approvalId, "rejected"),
  );
  ipcMain.handle("dashboard:set-trust-record", async (_event, request: SetTrustRecordRequest) =>
    setTrustRecord(config, request),
  );
  ipcMain.handle("dashboard:remove-trust-record", async (_event, peerOwnerId: string) =>
    removeTrustRecord(config, peerOwnerId),
  );
  ipcMain.handle("dashboard:search-vault", async (_event, query: string) =>
    searchSharedVault(config, query),
  );
  ipcMain.handle("dashboard:send-chat-message", async (_event, request) =>
    sendChatMessage(config, request),
  );
  ipcMain.handle("dashboard:send-task-proposal", async (_event, request) =>
    sendTaskProposal(config, request),
  );
  ipcMain.handle("dashboard:send-task-negotiate", async (_event, request) =>
    sendTaskNegotiate(config, request),
  );
  ipcMain.handle("dashboard:send-pairing-request", async (_event, request) =>
    sendPairingRequest(config, request),
  );
  ipcMain.handle("dashboard:export-pairing-timeline", async (_event, outputPath: string) =>
    exportPairingTimeline(config, outputPath),
  );
}
