"use client";

import { ChevronDown, ChevronRight } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import type { ReactNode } from "react";
import { useDocsSearch } from "@/components/docs-search";

/** A link that also clears the search, since it can point at the current page. */
export function SearchResetLink({
  children,
  className,
  href,
}: {
  children: ReactNode;
  className: string;
  href: string;
}) {
  const { setQuery } = useDocsSearch();

  return (
    <Link className={className} href={href} onClick={() => setQuery("")}>
      {children}
    </Link>
  );
}

/** A collapsible sidebar track. The track holding the current topic stays open. */
export function SidebarTrack({
  children,
  header,
  topicSlugs,
}: {
  children: ReactNode;
  header: ReactNode;
  topicSlugs: string[];
}) {
  const isActiveTrack = topicSlugs.includes(useActiveTopicSlug());
  const [expanded, setExpanded] = useState(false);
  const isExpanded = isActiveTrack || expanded;

  return (
    <div
      className={["menu-group", isActiveTrack ? "active" : "", isExpanded ? "open" : ""]
        .filter(Boolean)
        .join(" ")}
    >
      <button
        aria-expanded={isExpanded}
        className={isActiveTrack ? "menu-row active" : "menu-row"}
        onClick={() => setExpanded((current) => !current)}
        type="button"
      >
        {header}
        <span className="menu-chevron" aria-hidden="true">
          {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </span>
      </button>

      <div className="submenu-list">{children}</div>
    </div>
  );
}

export function SidebarTopicLink({ children, slug }: { children: ReactNode; slug: string }) {
  const { setQuery } = useDocsSearch();

  return (
    <Link
      className={useActiveTopicSlug() === slug ? "submenu-row active" : "submenu-row"}
      href={`/topics/${slug}`}
      onClick={() => setQuery("")}
    >
      {children}
    </Link>
  );
}

function useActiveTopicSlug() {
  const pathname = usePathname();

  return pathname.startsWith("/topics/") ? pathname.slice("/topics/".length) : "";
}
