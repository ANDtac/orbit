import { Component, type ErrorInfo, type PropsWithChildren } from "react";

import { Button } from "@/components/ui/Button";

interface ErrorBoundaryState {
  error: Error | null;
  retryKey: number;
}

export class ErrorBoundary extends Component<PropsWithChildren, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    error: null,
    retryKey: 0,
  };

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("orbit_ui_render_error", {
      message: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
    });
    // TODO: Report render errors to an external monitoring service (e.g. Sentry) so
    // the engineering team is alerted without requiring a user to report manually.
    // Example: Sentry.captureException(error, { extra: { componentStack: errorInfo.componentStack } });
  }

  private handleRetry = () => {
    this.setState((state) => ({
      error: null,
      retryKey: state.retryKey + 1,
    }));
  };

  render() {
    if (this.state.error) {
      return (
        <div className="mx-auto max-w-2xl rounded-3xl border border-red-500/20 bg-surface px-6 py-10 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-red-500">Render failure</p>
          <h1 className="mt-3 font-heading text-3xl text-primary">This view hit a client-side error.</h1>
          <p className="mt-3 text-sm text-muted">
            Orbit caught the crash before it took down the rest of the app. Retry the view and check the browser console if it happens again.
          </p>
          <p className="mt-4 rounded-2xl bg-background/60 px-4 py-3 font-mono text-sm text-text">
            {this.state.error.message}
          </p>
          <div className="mt-6 flex gap-3">
            <Button onClick={this.handleRetry}>Retry</Button>
            <Button variant="ghost" onClick={() => window.location.reload()}>
              Reload page
            </Button>
          </div>
        </div>
      );
    }

    return <div key={this.state.retryKey}>{this.props.children}</div>;
  }
}
