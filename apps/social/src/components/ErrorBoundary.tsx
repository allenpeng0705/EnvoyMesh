import { Component, type ReactNode } from "react";
import { I18nContext } from "../context/I18nContext.js";
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

function ErrorFallback({ error, onReset }: { error: Error | null; onReset: () => void }) {
  return (
    <I18nContext.Consumer>
      {(ctx) => {
        const t = ctx?.t ?? ((key: string) => translate(en, key));
        return (
          <div className="error-boundary">
            <div className="error-boundary-card">
              <h2>{t("errorBoundary.title")}</h2>
              <p className="error-boundary-message">
                {error?.message ?? t("errorBoundary.unexpected")}
              </p>
              <button className="primary" onClick={onReset}>
                {t("errorBoundary.tryAgain")}
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
