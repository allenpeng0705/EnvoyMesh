import { createRoot } from "react-dom/client";
import { NodeServiceProvider } from "./hooks/useNodeService.js";
import { NodeStateProvider } from "./context/NodeStateContext.js";
import { ErrorBoundary } from "./components/ErrorBoundary.js";
import { App } from "./App.js";

createRoot(document.getElementById("root")!).render(
  <NodeServiceProvider>
    <NodeStateProvider>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </NodeStateProvider>
  </NodeServiceProvider>,
);
