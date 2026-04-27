import { contextBridge, ipcRenderer } from "electron";
import type {
  DashboardApi,
  SendChatRequest,
  SendPairingRequest,
  SendTaskNegotiateRequest,
  SendTaskProposalRequest,
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
  sendChatMessage: (request: SendChatRequest) =>
    ipcRenderer.invoke("dashboard:send-chat-message", request),
  sendTaskProposal: (request: SendTaskProposalRequest) =>
    ipcRenderer.invoke("dashboard:send-task-proposal", request),
  sendTaskNegotiate: (request: SendTaskNegotiateRequest) =>
    ipcRenderer.invoke("dashboard:send-task-negotiate", request),
  sendPairingRequest: (request: SendPairingRequest) =>
    ipcRenderer.invoke("dashboard:send-pairing-request", request),
  exportPairingTimeline: (outputPath: string) =>
    ipcRenderer.invoke("dashboard:export-pairing-timeline", outputPath),
};

contextBridge.exposeInMainWorld("envoyDashboard", api);
