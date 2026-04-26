import type { DashboardApi } from "../shared/dashboard.js";

declare global {
  interface Window {
    envoyDashboard: DashboardApi;
  }
}

export {};
