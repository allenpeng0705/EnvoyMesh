import { createRoot } from "react-dom/client";
import { NodeServiceProvider } from "./hooks/useNodeService.js";
import { App } from "./App.js";

createRoot(document.getElementById("root")!).render(
  <NodeServiceProvider>
    <App />
  </NodeServiceProvider>,
);
