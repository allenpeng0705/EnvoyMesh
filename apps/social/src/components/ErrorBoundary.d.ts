import { Component, type ReactNode } from "react";
interface ErrorBoundaryProps {
    children: ReactNode;
    /** Custom fallback content to show instead of the default error card */
    fallback?: ReactNode;
}
interface ErrorBoundaryState {
    hasError: boolean;
    error: Error | null;
}
export declare class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
    state: ErrorBoundaryState;
    static getDerivedStateFromError(error: Error): ErrorBoundaryState;
    componentDidCatch(error: Error, info: React.ErrorInfo): void;
    private handleReset;
    render(): ReactNode;
}
export {};
//# sourceMappingURL=ErrorBoundary.d.ts.map