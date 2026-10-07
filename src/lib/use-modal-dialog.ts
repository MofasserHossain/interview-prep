import { useEffect, useEffectEvent, useRef } from "react";

type ModalDialogOptions = {
  /** Called after the dialog opens, for focus or selection. */
  onOpen?: () => void;
  /** Called when the reader closes the dialog, so `open` can follow. */
  onDismiss: () => void;
  open: boolean;
};

/**
 * Drives a native `<dialog>` from React state. The dialog opens as a modal, so
 * it sits above the sticky header and the rest of the page is inert while it is
 * open.
 *
 * A dialog can also close without React: Escape fires `close` on the element
 * itself, and a click that lands on the dialog rather than its panel is a click
 * on the backdrop. Both call `onDismiss` so the caller's state stays in step.
 */
export function useModalDialog({ onDismiss, onOpen, open }: ModalDialogOptions) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  // Effect Events always call the caller's latest callbacks, so the listeners
  // below are registered once rather than whenever the caller re-renders.
  const dismiss = useEffectEvent(onDismiss);
  const afterOpen = useEffectEvent(() => onOpen?.());

  useEffect(() => {
    const dialog = dialogRef.current;

    if (!dialog) return;

    // `showModal()` throws if the dialog is already open, and `close()` on a
    // closed dialog would fire a second `close` event.
    if (open && !dialog.open) {
      dialog.showModal();
      afterOpen();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;

    if (!dialog) return;

    function closeOnBackdropClick(event: MouseEvent) {
      if (event.target === dialog) dismiss();
    }

    function syncOnClose() {
      dismiss();
    }

    dialog.addEventListener("click", closeOnBackdropClick);
    dialog.addEventListener("close", syncOnClose);

    return () => {
      dialog.removeEventListener("click", closeOnBackdropClick);
      dialog.removeEventListener("close", syncOnClose);
    };
  }, []);

  return dialogRef;
}
