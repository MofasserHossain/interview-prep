"use client";

import { CornerDownLeft, FileText, Hash, Search, SearchX, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { getSearchTerms, loadSearchIndex, searchDocs } from "@/lib/search";
import type { SearchIndex } from "@/lib/types";

type SearchOption = {
  href: string;
  position: number;
};

/**
 * The docs search. The header shows a search button; clicking it, pressing
 * ⌘K / Ctrl+K, or pressing "/" opens a centered dialog that lists the topics
 * and sections whose titles match the query, grouped by topic. Choosing a
 * result opens that topic page, scrolled to the section. The title index
 * loads the first time the dialog opens.
 */
export function DocsSearch() {
  const router = useRouter();
  const listboxId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [index, setIndex] = useState<SearchIndex | null>(null);
  const [failed, setFailed] = useState(false);
  const shortcut = useSyncExternalStore(subscribeToNothing, getShortcutLabel, () => "");

  const trimmedQuery = query.trim();
  const terms = useMemo(() => getSearchTerms(query), [query]);
  const sectionCounts = useMemo(() => {
    const counts = new Map<string, number>();

    if (!index) return counts;

    for (const section of index.sections) {
      const slug = index.topics[section.topic].slug;
      counts.set(slug, (counts.get(slug) ?? 0) + 1);
    }

    return counts;
  }, [index]);
  // Each group's topic row, then its sections, numbered in display order for
  // keyboard navigation and `aria-activedescendant`.
  const rows = useMemo(() => {
    const result = [];
    let position = 0;

    for (const group of index ? searchDocs(index, query) : []) {
      const topicHref = `/topics/${group.topic.slug}`;
      const topic = { href: topicHref, position };
      const sections = [];

      position += 1;

      for (const section of group.sections) {
        sections.push({ href: `${topicHref}#${section.id}`, position, section });
        position += 1;
      }

      result.push({ group, sections, topic });
    }

    return result;
  }, [index, query]);
  const hrefs = useMemo(
    () => rows.flatMap((row) => [row.topic.href, ...row.sections.map((section) => section.href)]),
    [rows],
  );
  const active = hrefs.length ? Math.min(activeIndex, hrefs.length - 1) : -1;
  const showResults = rows.length > 0;

  // The dialog opens as a modal, so it sits above the sticky header and the
  // rest of the page is inert while it is open.
  useEffect(() => {
    const dialog = dialogRef.current;

    if (!dialog) return;

    if (open && !dialog.open) {
      dialog.showModal();
      inputRef.current?.select();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  // A click on the dialog element itself, rather than its panel, landed on
  // the backdrop.
  useEffect(() => {
    const dialog = dialogRef.current;

    if (!dialog) return;

    function closeOnBackdropClick(event: MouseEvent) {
      if (event.target === dialog) setOpen(false);
    }

    dialog.addEventListener("click", closeOnBackdropClick);

    return () => dialog.removeEventListener("click", closeOnBackdropClick);
  }, []);

  useEffect(() => {
    function openOnShortcut(event: globalThis.KeyboardEvent) {
      const commandK = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k";
      const slash =
        event.key === "/" &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !isEditable(event.target);

      if (commandK || slash) {
        event.preventDefault();
        setOpen(true);
      }
    }

    window.addEventListener("keydown", openOnShortcut);

    return () => window.removeEventListener("keydown", openOnShortcut);
  }, []);

  useEffect(() => {
    if (!open || index) return;

    let current = true;

    loadSearchIndex().then(
      (loaded) => {
        if (!current) return;
        setIndex(loaded);
        setFailed(false);
      },
      () => {
        if (current) setFailed(true);
      },
    );

    return () => {
      current = false;
    };
  }, [index, open]);

  useEffect(() => {
    if (open && active >= 0) {
      document.getElementById(`${listboxId}-${active}`)?.scrollIntoView({ block: "nearest" });
    }
  }, [active, listboxId, open]);

  function highlightOption(position: number) {
    setActiveIndex(position);
    router.prefetch(hrefs[position]);
  }

  function finish() {
    setOpen(false);
    setQuery("");
    setActiveIndex(0);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing) return;

    if ((event.key === "ArrowDown" || event.key === "ArrowUp") && hrefs.length) {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      highlightOption((active + step + hrefs.length) % hrefs.length);
    } else if (event.key === "Enter" && active >= 0) {
      event.preventDefault();
      router.push(hrefs[active]);
      finish();
    }
  }

  function renderOption(
    { href, position }: SearchOption,
    className: string,
    icon: ReactNode,
    content: ReactNode,
  ) {
    return (
      <Link
        aria-selected={position === active}
        className={position === active ? `${className} active` : className}
        href={href}
        id={`${listboxId}-${position}`}
        key={href}
        onClick={finish}
        onMouseMove={() => {
          if (position !== active) highlightOption(position);
        }}
        prefetch={false}
        // A native <option> cannot hold a link or rich content; the combobox
        // pattern marks these links as options instead.
        // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
        role="option"
        tabIndex={-1}
      >
        <span className="search-option-icon" aria-hidden="true">
          {icon}
        </span>
        <span className="search-option-copy">{content}</span>
        <CornerDownLeft aria-hidden="true" className="search-option-enter" size={15} />
      </Link>
    );
  }

  return (
    <>
      <button
        aria-haspopup="dialog"
        className="search-field search-trigger"
        onClick={() => setOpen(true)}
        type="button"
      >
        <Search size={18} />
        <span className="search-trigger-label">Search docs</span>
        {shortcut ? <kbd>{shortcut}</kbd> : null}
      </button>

      <dialog
        aria-label="Search docs"
        className="search-dialog"
        onClose={() => setOpen(false)}
        ref={dialogRef}
      >
        <div className="search-panel">
          <div className="search-panel-header">
            <Search aria-hidden="true" size={20} />
            <input
              aria-activedescendant={active >= 0 ? `${listboxId}-${active}` : undefined}
              aria-autocomplete="list"
              aria-controls={showResults ? listboxId : undefined}
              aria-expanded={showResults}
              aria-label="Search topics and sections"
              autoComplete="off"
              enterKeyHint="go"
              onChange={(event) => {
                setQuery(event.target.value);
                setActiveIndex(0);
              }}
              onKeyDown={onKeyDown}
              placeholder="Search topics and interview questions"
              ref={inputRef}
              role="combobox"
              spellCheck={false}
              value={query}
            />
            <button
              aria-label="Close search"
              className="search-close"
              onClick={() => setOpen(false)}
              title="Close (Esc)"
              type="button"
            >
              <X size={18} />
            </button>
          </div>

          {showResults ? (
            <div
              aria-label="Search results"
              className="search-results"
              id={listboxId}
              // Keeps focus in the input while the pointer is on the list, so
              // the arrow keys keep working after a click or a scrollbar drag.
              onMouseDown={(event) => event.preventDefault()}
              // Grouped, highlighted results need a custom listbox; a native
              // <select> or <datalist> cannot render them.
              // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
              role="listbox"
              tabIndex={-1}
            >
              {rows.map(({ group, sections, topic }) => (
                <div className="search-group" key={group.topic.slug} role="presentation">
                  {renderOption(
                    topic,
                    "search-option search-option-topic",
                    <FileText size={16} />,
                    <>
                      <strong>{highlight(group.topic.title, terms)}</strong>
                      <small>
                        {group.topic.track} · {sectionCounts.get(group.topic.slug) ?? 0} sections
                      </small>
                    </>,
                  )}
                  {sections.map(({ section, ...option }) =>
                    renderOption(
                      option,
                      "search-option search-option-section",
                      <Hash size={14} />,
                      <span>{highlight(section.title.replaceAll("`", ""), terms)}</span>,
                    ),
                  )}
                </div>
              ))}
            </div>
          ) : (
            <output className="search-empty">
              {trimmedQuery && index ? <SearchX size={28} /> : <Search size={28} />}
              <strong>
                {!trimmedQuery
                  ? "Search the docs"
                  : !index
                    ? failed
                      ? "Search is unavailable right now"
                      : "Loading search…"
                    : `No results for “${trimmedQuery}”`}
              </strong>
              <span>
                {!trimmedQuery
                  ? index
                    ? `Find any of ${index.topics.length} topics and ${index.sections.length.toLocaleString("en")} interview questions by title.`
                    : "Find topics and interview questions by title."
                  : index
                    ? "Try a shorter or different keyword."
                    : null}
              </span>
            </output>
          )}

          <div className="search-panel-footer">
            <span className="search-keys">
              <kbd>↑</kbd>
              <kbd>↓</kbd> to move <kbd>↵</kbd> to open <kbd>esc</kbd> to close
            </span>
            {showResults ? (
              <span>
                {hrefs.length} {hrefs.length === 1 ? "result" : "results"}
              </span>
            ) : null}
          </div>
        </div>
      </dialog>
    </>
  );
}

/** Wraps each occurrence of a search term in `<mark>`. */
function highlight(text: string, terms: string[]): ReactNode {
  if (!terms.length) return text;

  const pattern = new RegExp(`(${terms.map(escapeRegExp).join("|")})`, "gi");
  let offset = 0;

  return text.split(pattern).map((part, partIndex) => {
    const key = offset;
    offset += part.length;

    return partIndex % 2 ? <mark key={key}>{part}</mark> : part;
  });
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isEditable(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName))
  );
}

// The shortcut label depends on the platform, which the server cannot know;
// rendering it only on the client avoids a hydration mismatch.
function subscribeToNothing() {
  return () => {};
}

function getShortcutLabel() {
  return /Mac|iPhone|iPad/.test(navigator.userAgent) ? "⌘K" : "Ctrl K";
}
