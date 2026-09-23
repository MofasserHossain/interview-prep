import { useEffect, useRef } from "react";

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
  // The listeners are registered once, so they read the current callbacks from
  // a ref rather than re-subscribing whenever the caller re-renders.
  const handlers = useRef({ onDismiss, onOpen });

  // Declared before the effects that read it, so it is current by the time
  // they run. Assigning during render would be unsafe.
  useEffect(() => {
    handlers.current = { onDismiss, onOpen };
  });

  useEffect(() => {
    const dialog = dialogRef.current;

    if (!dialog) return;

    // `showModal()` throws if the dialog is already open, and `close()` on a
    // closed dialog would fire a second `close` event.
    if (open && !dialog.open) {
      dialog.showModal();
      handlers.current.onOpen?.();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;

    if (!dialog) return;

    function closeOnBackdropClick(event: MouseEvent) {
      if (event.target === dialog) handlers.current.onDismiss();
    }

    function syncOnClose() {
      handlers.current.onDismiss();
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
