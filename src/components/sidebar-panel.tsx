"use client";

import { PanelLeft } from "lucide-react";
import { createContext, useContext, useMemo, useState, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";

const SidebarContext = createContext({ open: false, setOpen: (_open: boolean) => {} });
const mobileQuery = "(width < 56.25rem)";

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
    <Button
      variant="ghost"
      size="icon"
      className="hidden size-10 rounded-md border border-border max-tablet:inline-flex"
      type="button"
      aria-label="Open navigation"
      aria-expanded={open}
      aria-controls="mobile-sidebar"
      onClick={() => setOpen(true)}
    >
      <PanelLeft size={20} />
    </Button>
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
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent
        side="left"
        id="mobile-sidebar"
        className="sidebar-sheet w-[min(320px,calc(100vw-48px))]! gap-0 bg-background p-0"
        onClick={(event) => {
          if (event.target instanceof Element && event.target.closest("a[href]")) setOpen(false);
        }}
      >
        <SheetTitle className="sr-only">Docs navigation</SheetTitle>
        {children}
      </SheetContent>
    </Sheet>
  );
}
