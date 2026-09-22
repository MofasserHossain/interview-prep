"use client";

import { AlertTriangle, RefreshCcw } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";

type ErrorProps = {
  error: Error & { digest?: string };
  retry: () => void;
};

// Renders inside the docs layout, so the real sidebar stays usable and this
// boundary does not need the topic registry in the browser.
export default function Error({ error, retry }: ErrorProps) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <section className="workspace">
      <header className="workspace-header">
        <div className="topbar">
          <nav className="workspace-path" aria-label="Current docs path">
            <span className="workspace-path-segment">
              <Link href="/">Docs</Link>
            </span>
            <span className="workspace-path-segment">Unable to load this view</span>
          </nav>
        </div>
      </header>

      <section className="doc-layout">
        <article className="detail-panel detail-error-state">
          <div className="system-state-icon" aria-hidden="true">
            <AlertTriangle size={24} />
          </div>
          <p className="eyebrow">Route Error</p>
          <h2>This page could not render</h2>
          <p>
            The docs navigation is still available. Retry this view, go back to the docs index, or
            choose another topic from the sidebar.
          </p>
          {error.message ? <code>{error.message}</code> : null}
          <div className="error-actions">
            <button className="state-primary-action" onClick={retry} type="button">
              <RefreshCcw size={16} />
              Try Again
            </button>
            <Link className="state-secondary-action" href="/">
              Docs Index
            </Link>
          </div>
        </article>
      </section>
    </section>
  );
}
