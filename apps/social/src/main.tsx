import { createRoot } from "react-dom/client";
import { NodeServiceProvider } from "./hooks/useNodeService.js";
import { NodeStateProvider } from "./context/NodeStateContext.js";
import { ThemeProvider } from "./context/ThemeContext.js";
import { I18nProvider } from "./context/I18nContext.js";
import { ErrorBoundary } from "./components/ErrorBoundary.js";
import { App } from "./App.js";

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <NodeServiceProvider>
      <NodeStateProvider>
        <ThemeProvider>
          <I18nProvider>
            <App />
          </I18nProvider>
        </ThemeProvider>
      </NodeStateProvider>
    </NodeServiceProvider>
  </ErrorBoundary>,
);
