"use client";

import {
  useState,
  useId,
  useRef,
  useEffect,
  useCallback,
  useLayoutEffect,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

type InfoPopoverProps = {
  title: string;
  children: ReactNode;
  side?: "top" | "right" | "bottom" | "left";
};

const InfoIcon = () => (
  <svg
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.3"
    className="h-3.5 w-3.5"
  >
    <circle cx="8" cy="8" r="6.5" />
    <path d="M8 7.2v4" strokeLinecap="round" />
    <circle cx="8" cy="5.2" r="0.6" fill="currentColor" stroke="none" />
  </svg>
);

const PANEL_WIDTH = 320;
const GAP = 6;

const computePosition = (
  rect: DOMRect,
  side: "top" | "right" | "bottom" | "left",
): { top: number; left: number } => {
  switch (side) {
    case "top":
      return { top: rect.top + window.scrollY - GAP, left: rect.left + window.scrollX };
    case "left":
      return { top: rect.top + window.scrollY, left: rect.left + window.scrollX - PANEL_WIDTH - GAP };
    case "right":
      return { top: rect.top + window.scrollY, left: rect.right + window.scrollX + GAP };
    case "bottom":
    default:
      return { top: rect.bottom + window.scrollY + GAP, left: rect.left + window.scrollX };
  }
};

export const InfoPopover = ({
  title,
  children,
  side = "bottom",
}: InfoPopoverProps) => {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = `info-popover-${useId()}`;
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  const toggle = useCallback(() => setOpen((p) => !p), []);

  // Recompute position when the popover opens or the window scrolls/resizes
  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const update = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const computed = computePosition(rect, side);
      // Clamp horizontally so the panel doesn't overflow the viewport
      const maxLeft = window.innerWidth - PANEL_WIDTH - 8;
      computed.left = Math.max(8, Math.min(computed.left, maxLeft));
      setPos(computed);
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open, side]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        triggerRef.current?.contains(target) ||
        panelRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    };
    document.addEventListener("keydown", handleKey);
    document.addEventListener("mousedown", handleClick);
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.removeEventListener("mousedown", handleClick);
    };
  }, [open]);

  return (
    <div className="relative inline-flex">
      <button
        ref={triggerRef}
        onClick={toggle}
        aria-expanded={open}
        aria-controls={panelId}
        className="inline-flex items-center justify-center rounded-full text-muted-foreground/40 transition-colors hover:text-muted-foreground/80"
        aria-label={`Info: ${title}`}
      >
        <InfoIcon />
      </button>

      {open &&
        createPortal(
          <div
            ref={panelRef}
            id={panelId}
            role="dialog"
            aria-label={title}
            style={{ position: "absolute", top: pos.top, left: pos.left, width: PANEL_WIDTH }}
            className="z-[9999] rounded-lg border border-border/50 bg-popover shadow-xl"
          >
            <div className="flex items-center justify-between border-b border-border/30 px-3 py-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-foreground/80">
                {title}
              </span>
              <button
                onClick={() => setOpen(false)}
                className="text-muted-foreground/40 transition-colors hover:text-foreground"
                aria-label="Close"
              >
                <svg viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
                  <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z" />
                </svg>
              </button>
            </div>
            <div className="info-popover-body max-h-[360px] overflow-y-auto px-3 py-2.5 text-[11px] leading-relaxed text-muted-foreground [&_h4]:mb-1 [&_h4]:mt-2.5 [&_h4]:text-[10px] [&_h4]:font-bold [&_h4]:uppercase [&_h4]:tracking-wider [&_h4]:text-foreground/70 [&_li]:ml-3 [&_li]:list-disc [&_p]:mb-1.5 [&_ul]:mb-1.5 [&_ul]:space-y-0.5">
              {children}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
};
