"use client";

import { Eye, EyeOff, GraduationCap } from "lucide-react";
import { useId, useState } from "react";
import type { ReactNode } from "react";
import { setPracticeMode } from "@/lib/practice-mode";
import { usePracticeMode } from "@/lib/use-practice-mode";

/** Turns practice mode on or off. The choice applies to every topic page. */
export function PracticeModeToggle() {
  const on = usePracticeMode();

  return (
    <button
      aria-pressed={on}
      className="practice-toggle"
      onClick={() => setPracticeMode(!on)}
      type="button"
    >
      <GraduationCap aria-hidden="true" size={16} />
      Practice mode
    </button>
  );
}

/**
 * A question's answer. In practice mode it stays hidden behind a button until
 * the reader reveals it; outside practice mode the button is hidden and the
 * answer shows. The hiding is CSS keyed on `<html data-practice>`, so a saved
 * choice applies before hydration. Revealed answers hide again on the next
 * visit to the page.
 */
export function PracticeAnswer({ children }: { children: ReactNode }) {
  const answerId = useId();
  const [revealed, setRevealed] = useState(false);

  return (
    <div className="practice-answer" data-revealed={revealed ? "" : undefined}>
      <button
        aria-controls={answerId}
        aria-expanded={revealed}
        className="answer-reveal"
        onClick={() => setRevealed((current) => !current)}
        type="button"
      >
        {revealed ? <EyeOff aria-hidden="true" size={15} /> : <Eye aria-hidden="true" size={15} />}
        {revealed ? "Hide answer" : "Show answer"}
      </button>
      <div className="practice-answer-body" id={answerId}>
        {children}
      </div>
    </div>
  );
}
