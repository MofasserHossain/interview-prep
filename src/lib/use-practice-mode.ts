import { useSyncExternalStore } from "react";
import { isPracticeModeOn, subscribeToPracticeMode } from "@/lib/practice-mode";

/**
 * Whether practice mode is on. The server cannot read localStorage, so it
 * renders "off"; React switches to the saved value right after hydration.
 * The CSS reads `<html data-practice>` directly, so nothing flashes meanwhile.
 */
export function usePracticeMode() {
  return useSyncExternalStore(subscribeToPracticeMode, isPracticeModeOn, getServerPracticeMode);
}

function getServerPracticeMode() {
  return false;
}
