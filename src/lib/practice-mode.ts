/**
 * Practice mode hides every question's answer until the reader reveals it. The
 * choice is saved in localStorage and mirrored onto `<html data-practice>`,
 * which is what the CSS keys on.
 *
 * Pages are prerendered without the attribute, so `practiceModeScript` runs in
 * the root layout's `<head>` and copies a saved choice onto `<html>` before the
 * first paint. Without it, answers would flash before hydration hid them.
 */
const storageKey = "practice-mode";
const changeEvent = "practice-mode-change";

export const practiceModeScript = `(function(){try{if(localStorage.getItem("${storageKey}")==="on")document.documentElement.dataset.practice="on"}catch(e){}})()`;

export function isPracticeModeOn() {
  return document.documentElement.dataset.practice === "on";
}

export function setPracticeMode(on: boolean) {
  applyPracticeMode(on);

  try {
    if (on) {
      localStorage.setItem(storageKey, "on");
    } else {
      localStorage.removeItem(storageKey);
    }
  } catch {
    // Storage can be unavailable (private mode, blocked cookies). The mode
    // still applies to this page; it just is not remembered.
  }

  window.dispatchEvent(new Event(changeEvent));
}

/** Notifies on changes from this tab and, through `storage`, from others. */
export function subscribeToPracticeMode(onChange: () => void) {
  function syncFromOtherTab(event: StorageEvent) {
    if (event.key !== storageKey) return;

    applyPracticeMode(event.newValue === "on");
    onChange();
  }

  window.addEventListener(changeEvent, onChange);
  window.addEventListener("storage", syncFromOtherTab);

  return () => {
    window.removeEventListener(changeEvent, onChange);
    window.removeEventListener("storage", syncFromOtherTab);
  };
}

function applyPracticeMode(on: boolean) {
  if (on) {
    document.documentElement.dataset.practice = "on";
  } else {
    delete document.documentElement.dataset.practice;
  }
}
