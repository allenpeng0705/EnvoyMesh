import { contextBridge, ipcRenderer } from "electron";
import type {
  DashboardApi,
  SetTrustRecordRequest,
} from "../shared/dashboard.js";

const api: DashboardApi = {
  getConfig: () => ipcRenderer.invoke("dashboard:get-config"),
  getDashboardSnapshot: () => ipcRenderer.invoke("dashboard:get-snapshot"),
  approveRequest: (approvalId: string) =>
    ipcRenderer.invoke("dashboard:approve-request", approvalId),
  rejectRequest: (approvalId: string) =>
    ipcRenderer.invoke("dashboard:reject-request", approvalId),
  setTrustRecord: (request: SetTrustRecordRequest) =>
    ipcRenderer.invoke("dashboard:set-trust-record", request),
  removeTrustRecord: (peerOwnerId: string) =>
    ipcRenderer.invoke("dashboard:remove-trust-record", peerOwnerId),
  searchVault: (query: string) => ipcRenderer.invoke("dashboard:search-vault", query),
};

contextBridge.exposeInMainWorld("envoyDashboard", api);
