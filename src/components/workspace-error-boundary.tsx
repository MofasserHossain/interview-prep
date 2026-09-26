"use client";

import { AlertTriangle, RefreshCcw } from "lucide-react";
import { Component as ReactComponent } from "react";
import type { ReactNode } from "react";

type WorkspaceErrorBoundaryProps = {
  children: ReactNode;
  resetKey: string;
};

type WorkspaceErrorBoundaryState = {
  error: Error | null;
};

export class WorkspaceErrorBoundary extends ReactComponent<
  WorkspaceErrorBoundaryProps,
  WorkspaceErrorBoundaryState
> {
  state: WorkspaceErrorBoundaryState = {
    error: null,
  };

  static getDerivedStateFromError(error: Error): WorkspaceErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error(error);
  }

  componentDidUpdate(previousProps: WorkspaceErrorBoundaryProps) {
    if (previousProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) {
      return (
        <section className="doc-layout">
          <DocumentErrorPanel
            error={this.state.error}
            onRetry={() => this.setState({ error: null })}
          />
        </section>
      );
    }

    return this.props.children;
  }
}

function DocumentErrorPanel({ error, onRetry }: { error: Error; onRetry: () => void }) {
  return (
    <article className="detail-panel detail-error-state">
      <div className="system-state-icon" aria-hidden="true">
        <AlertTriangle size={24} />
      </div>
      <p className="eyebrow">Document Error</p>
      <h2>Unable to render this document</h2>
      <p>
        The docs layout is still available. Try rendering this panel again, or choose another topic
        from the sidebar.
      </p>
      {error.message ? <code>{error.message}</code> : null}
      <button className="state-primary-action" onClick={onRetry} type="button">
        <RefreshCcw size={16} />
        Try Again
      </button>
    </article>
  );
}
