import { Component, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { hasError: boolean };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          className="flex flex-col items-center justify-center min-h-screen gap-4"
          style={{ backgroundColor: "var(--bg)", color: "var(--text)" }}
        >
          <h1 className="font-display text-2xl font-bold">Something went wrong</h1>
          <p className="text-sm" style={{ color: "var(--text-dim)" }}>
            An unexpected error occurred.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-5 py-2 rounded-full text-sm font-semibold text-white"
            style={{ backgroundColor: "var(--warm)" }}
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
