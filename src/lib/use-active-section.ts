import { useEffect, useState } from "react";
import type { TocEntry } from "@/lib/types";

/**
 * Tracks which section the reader is on, for the table of contents: the last
 * section whose top has scrolled above the reading line under the sticky
 * header. `sections` must keep its identity between renders (memoize it).
 */
export function useActiveSection(sections: TocEntry[]) {
  const [selectedId, setSelectedId] = useState("");

  useEffect(() => {
    if (!sections.length) return;

    const workspace = document.querySelector<HTMLElement>(".workspace");
    let animationFrame = 0;

    function updateActiveSection() {
      animationFrame = 0;

      const elements = sections
        .map((section) => document.getElementById(section.id))
        .filter((element): element is HTMLElement => Boolean(element));

      if (!elements.length) return;

      const workspaceTop = workspace?.getBoundingClientRect().top ?? 0;
      const readingAnchor = workspaceTop + 130;
      let activeElement = elements[0];

      for (const element of elements) {
        if (element.getBoundingClientRect().top <= readingAnchor) {
          activeElement = element;
        } else {
          break;
        }
      }

      setSelectedId((current) => (current === activeElement.id ? current : activeElement.id));
    }

    function scheduleUpdate() {
      if (animationFrame) return;
      animationFrame = window.requestAnimationFrame(updateActiveSection);
    }

    scheduleUpdate();
    workspace?.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate);

    return () => {
      if (animationFrame) {
        window.cancelAnimationFrame(animationFrame);
      }

      workspace?.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
    };
  }, [sections]);

  function selectSection(sectionId: string) {
    setSelectedId(sectionId);
    window.requestAnimationFrame(() => {
      document.getElementById(sectionId)?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }

  return {
    selectedId: sections.some((section) => section.id === selectedId)
      ? selectedId
      : (sections[0]?.id ?? ""),
    selectSection,
  };
}
