import { createRoot } from "react-dom/client";
import { NodeServiceProvider } from "./hooks/useNodeService.js";
import { NodeStateProvider } from "./context/NodeStateContext.js";
import { ThemeProvider } from "./context/ThemeContext.js";
import { ErrorBoundary } from "./components/ErrorBoundary.js";
import { App } from "./App.js";

createRoot(document.getElementById("root")!).render(
  <NodeServiceProvider>
    <NodeStateProvider>
      <ThemeProvider>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </ThemeProvider>
    </NodeStateProvider>
  </NodeServiceProvider>,
);
