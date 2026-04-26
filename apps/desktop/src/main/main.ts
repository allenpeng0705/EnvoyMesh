import {
  createDashboardConfig,
  getDashboardSnapshot,
  removeTrustRecord,
  searchSharedVault,
  setTrustRecord,
  updateApprovalStatus,
} from "./dashboard-service.js";
import { app, BrowserWindow, ipcMain } from "electron";
import { join } from "node:path";
import type { SetTrustRecordRequest } from "../shared/dashboard.js";

const config = createDashboardConfig();

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
  registerIpcHandlers();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

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
}
