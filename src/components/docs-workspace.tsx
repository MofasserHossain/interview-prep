import Link from "next/link";
import type { ReactNode } from "react";
import { DocsSearch } from "@/components/docs-search";
import { SidebarTrigger } from "@/components/sidebar-panel";
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
    <section className="workspace max-mobile:px-0 max-mobile:pt-0">
      <header className="sticky top-0 z-20 flex min-h-(--shell-header-height) shrink-0 items-center border-b border-border bg-background px-(--workspace-x-padding) max-mobile:px-3.5 max-mobile:py-3">
        <div className="grid w-full min-w-0 grid-cols-[minmax(0,1fr)_minmax(260px,440px)] items-center gap-3 max-tablet:grid-cols-[minmax(0,1fr)_minmax(160px,240px)] max-mobile:grid-cols-1 max-mobile:gap-2.5">
          <div className="flex min-w-0 items-center gap-3">
            <SidebarTrigger />
            <nav className="workspace-path whitespace-nowrap" aria-label="Current docs path">
              {headerPath.map((segment, index) => (
                <span
                  className={
                    index > 0 && index < headerPath.length - 1
                      ? "workspace-path-segment max-mobile:hidden"
                      : "workspace-path-segment"
                  }
                  // A segment is identified by its depth, and a track and topic
                  // can share a title.
                  // oxlint-disable-next-line react/no-array-index-key
                  key={`${index}-${segment}`}
                >
                  {index === 0 ? <Link href="/">{segment}</Link> : segment}
                </span>
              ))}
            </nav>
          </div>

          <DocsSearch />
        </div>
      </header>

      <WorkspaceErrorBoundary resetKey={headerPath.join("/")}>{children}</WorkspaceErrorBoundary>

      <SiteFooter />
    </section>
  );
}
