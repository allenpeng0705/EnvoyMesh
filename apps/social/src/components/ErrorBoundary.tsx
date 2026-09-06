import { Component, type ReactNode } from "react";
import { I18nContext } from "../context/i18n-context.js";
import { translate } from "../i18n/translate.js";
import { en } from "../i18n/messages/en.js";

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

function isProviderContextError(error: Error | null): boolean {
  const msg = error?.message ?? "";
  return (
    /must be used within (NodeStateProvider|NodeServiceProvider|CallSessionProvider)/i.test(msg) ||
    /must be inside <(I18nProvider|ToastProvider)>/i.test(msg)
  );
}

function ErrorFallback({ error, onReset }: { error: Error | null; onReset: () => void }) {
  const providerError = isProviderContextError(error);
  return (
    <I18nContext.Consumer>
      {(ctx) => {
        const t = ctx?.t ?? ((key: string) => translate(en, key));
        return (
          <div className="error-boundary">
            <div className="error-boundary-card">
              <h2>{t("errorBoundary.title")}</h2>
              <p className="error-boundary-message">
                {providerError
                  ? t(
                      "errorBoundary.providerLost",
                      "The app lost its session state. Reloading usually fixes this after a long run.",
                    )
                  : (error?.message ?? t("errorBoundary.unexpected"))}
              </p>
              <button
                className="primary"
                onClick={() => {
                  if (providerError && typeof window !== "undefined") {
                    window.location.reload();
                    return;
                  }
                  onReset();
                }}
              >
                {providerError
                  ? t("errorBoundary.reload", "Reload")
                  : t("errorBoundary.tryAgain")}
              </button>
            </div>
          </div>
        );
      }}
    </I18nContext.Consumer>
  );
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  private handleReset = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return <ErrorFallback error={this.state.error} onReset={this.handleReset} />;
    }

    return this.props.children;
  }
}
