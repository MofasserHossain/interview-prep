"use client";

import { PanelLeft, X } from "lucide-react";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import type { ReactNode } from "react";
import { useModalDialog } from "@/lib/use-modal-dialog";

const SidebarContext = createContext({ open: false, setOpen: (_open: boolean) => {} });
const mobileQuery = "(max-width: 900px)";

function subscribe(onChange: () => void) {
  const query = window.matchMedia(mobileQuery);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const value = useMemo(() => ({ open, setOpen }), [open]);
  return <SidebarContext value={value}>{children}</SidebarContext>;
}

export function SidebarTrigger() {
  const { open, setOpen } = useContext(SidebarContext);
  return (
    <button
      className="sidebar-toggle"
      type="button"
      aria-label="Open navigation"
      aria-expanded={open}
      aria-controls="mobile-sidebar"
      onClick={() => setOpen(true)}
    >
      <PanelLeft size={20} />
    </button>
  );
}

/** The server-rendered topic tree is shared by desktop and mobile. */
export function SidebarPanel({ children }: { children: ReactNode }) {
  const mobile = useSyncExternalStore(
    subscribe,
    () => window.matchMedia(mobileQuery).matches,
    () => false,
  );
  if (!mobile) return <div className="desktop-sidebar">{children}</div>;
  return <MobileSidebar>{children}</MobileSidebar>;
}

function MobileSidebar({ children }: { children: ReactNode }) {
  const { open, setOpen } = useContext(SidebarContext);
  const dialogRef = useModalDialog({ open, onDismiss: () => setOpen(false) });

  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    function closeOnNavigation(event: MouseEvent) {
      if (event.target instanceof Element && event.target.closest("a[href]")) setOpen(false);
    }
    dialog?.addEventListener("click", closeOnNavigation);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      dialog?.removeEventListener("click", closeOnNavigation);
      document.body.style.overflow = previous;
    };
  }, [dialogRef, open, setOpen]);

  return (
    <dialog
      ref={dialogRef}
      id="mobile-sidebar"
      className="sidebar-dialog"
      aria-label="Docs navigation"
    >
      <div className="sidebar-sheet">
        <button
          className="sidebar-close"
          type="button"
          aria-label="Close navigation"
          onClick={() => setOpen(false)}
        >
          <X size={20} />
        </button>
        {children}
      </div>
    </dialog>
  );
}
