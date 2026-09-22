import Link from "next/link";
import type { ReactNode } from "react";
import { DocsSearch } from "@/components/docs-search";
import { SiteFooter } from "@/components/site-footer";
import { WorkspaceErrorBoundary } from "@/components/workspace-error-boundary";

/**
 * The scrolling column beside the sidebar: the breadcrumb and search button,
 * the page content, then the footer. Only the search and the error boundary
 * run in the browser.
 */
export function DocsWorkspace({
  children,
  headerPath,
}: {
  children: ReactNode;
  headerPath: string[];
}) {
  return (
    <section className="workspace">
      <header className="workspace-header">
        <div className="topbar">
          <nav className="workspace-path" aria-label="Current docs path">
            {headerPath.map((segment, index) => (
              <span className="workspace-path-segment" key={`${index}-${segment}`}>
                {index === 0 ? <Link href="/">{segment}</Link> : segment}
              </span>
            ))}
          </nav>

          <DocsSearch />
        </div>
      </header>

      <WorkspaceErrorBoundary resetKey={headerPath.join("/")}>{children}</WorkspaceErrorBoundary>

      <SiteFooter />
    </section>
  );
}
