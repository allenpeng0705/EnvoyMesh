import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Component } from "react";
export class ErrorBoundary extends Component {
    state = { hasError: false, error: null };
    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }
    componentDidCatch(error, info) {
        console.error("[ErrorBoundary]", error, info.componentStack);
    }
    handleReset = () => {
        this.setState({ hasError: false, error: null });
    };
    render() {
        if (this.state.hasError) {
            if (this.props.fallback)
                return this.props.fallback;
            return (_jsx("div", { className: "error-boundary", children: _jsxs("div", { className: "error-boundary-card", children: [_jsx("h2", { children: "Something went wrong" }), _jsx("p", { className: "error-boundary-message", children: this.state.error?.message ?? "An unexpected error occurred." }), _jsx("button", { className: "primary", onClick: this.handleReset, children: "Try Again" })] }) }));
        }
        return this.props.children;
    }
}
//# sourceMappingURL=ErrorBoundary.js.map